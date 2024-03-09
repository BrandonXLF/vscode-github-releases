import * as vscode from 'vscode';
import * as git from './types/git';
import { Octokit } from '@octokit/rest';
import { exec } from 'child_process';
import fs from 'fs/promises';

export interface ReleaseAsset {
    id: number;
    name: string;
    url: string;
}

export interface Release {
    id: number;
    tag: string;
    title: string;
    desc: string;
    url: string;
    assets: ReleaseAsset[];
    draft: boolean;
    prerelease: boolean;
    remote: Remote;
    author: string;
    authorIcon: string;
    createDate: string;
    publishDate: string | null;
}

export class Remote {
    constructor(
        private readonly octokit: Octokit,
        public readonly owner: string,
        public readonly name: string,
        public readonly localRepo: git.Repository,
        public readonly localName: string,
        public readonly url: string,
    ) {}

    get identifier() {
        return `${this.owner}/${this.name}`;
    }

    async getReleases() {
        const res = await this.octokit.repos.listReleases({
            owner: this.owner,
            repo: this.name,
        });

        return res.data.map<Release>((item) => ({
            id: item.id,
            tag: item.tag_name,
            title: item.name ?? '',
            desc: item.body ?? '',
            url: item.html_url,
            assets: item.assets.map((assetItem) => ({
                id: assetItem.id,
                name: assetItem.name,
                url: assetItem.browser_download_url,
            })),
            draft: item.draft,
            prerelease: item.prerelease,
            remote: this,
            author: item.author.login,
            authorIcon: item.author.avatar_url,
            createDate: item.created_at,
            publishDate: item.published_at,
        }));
    }

    async getTags() {
        const res = await this.octokit.repos.listTags({
            owner: this.owner,
            repo: this.name,
        });

        return res.data.map((item) => item.name);
    }

    async getBranches() {
        const res = await this.octokit.git.listMatchingRefs({
            owner: this.owner,
            repo: this.name,
            ref: 'heads',
        });

        return res.data.map((item) => item.ref.replace(/^refs\/heads\//, ''));
    }

    async getCommitHashes() {
        const res = await this.octokit.repos.listCommits({
            owner: this.owner,
            repo: this.name,
        });

        return res.data.map((item) => item.sha);
    }

    async checkoutTag(tag: string) {
        try {
            await new Promise<void>((resolve, reject) => {
                exec(
                    `git fetch ${this.localName} tag ${tag} --porcelain`,
                    {
                        cwd: this.localRepo.rootUri.fsPath,
                    },
                    (_err, _stdout, stderr) =>
                        stderr ? reject(new Error(stderr)) : resolve(),
                );
            });

            await new Promise<void>((resolve, reject) => {
                exec(
                    `git checkout ${tag} --quiet`,
                    {
                        cwd: this.localRepo.rootUri.fsPath,
                    },
                    (_err, _stdout, stderr) =>
                        stderr ? reject(new Error(stderr)) : resolve(),
                );
            });

            vscode.window.showInformationMessage(`Switched to tag ${tag}`);
        } catch (e) {
            vscode.window.showErrorMessage(
                `Failed to checkout tag: ${(e as Error).message}`,
            );
        }
    }

    async updateOrPublishRelease(data: any) {
        const endpoint = data.id
            ? this.octokit.repos.updateRelease
            : this.octokit.repos.createRelease;

        try {
            const res = await endpoint({
                owner: this.owner,
                repo: this.name,
                release_id: data.id,
                tag_name: data.tag,
                target_commitish: data.target || undefined,
                name: data.title,
                body: data.desc,
                draft: data.draft,
                prerelease: data.prerelease,
            });

            return res.data;
        } catch (e) {
            vscode.window.showErrorMessage(
                `Failed to publish release: ${(e as Error).message}`,
            );
        }
    }

    async deleteRelease(releaseId: number) {
        await this.octokit.repos.deleteRelease({
            owner: this.owner,
            repo: this.name,
            release_id: releaseId,
        });
    }

    async tryUploadReleaseAsset(releaseId: number, name: string, path: string) {
        try {
            await this.octokit.repos.uploadReleaseAsset({
                owner: this.owner,
                repo: this.name,
                release_id: releaseId,
                name: name,
                data: (await fs.readFile(path)) as unknown as string, // https://github.com/octokit/octokit.js/discussions/2087
            });
        } catch {
            vscode.window.showErrorMessage(
                `Failed to add release asset ${name}`,
            );
        }
    }

    async tryDeleteReleaseAsset(id: number, name: string) {
        try {
            await this.octokit.repos.deleteReleaseAsset({
                owner: this.owner,
                repo: this.name,
                asset_id: id,
            });
        } catch {
            vscode.window.showErrorMessage(
                `Failed to delete release asset "${name}"`,
            );
        }
    }

    async tryRenameReleaseAsset(id: number, oldName: string, newName: string) {
        try {
            await this.octokit.repos.updateReleaseAsset({
                owner: this.owner,
                repo: this.name,
                asset_id: id,
                name: newName,
            });
        } catch {
            vscode.window.showErrorMessage(
                `Failed to rename release asset "${oldName}" to "${newName}"`,
            );
        }
    }

    async generateReleaseNotes(tag: string, target?: string) {
        try {
            const res = await this.octokit.repos.generateReleaseNotes({
                owner: this.owner,
                repo: this.name,
                tag_name: tag,
                target_commitish: target || undefined,
            });

            return {
                title: res.data.name,
                desc: res.data.body,
            };
        } catch (e) {
            vscode.window.showErrorMessage(
                `Failed to generate release notes: ${(e as Error).message}`,
            );
        }
    }
}

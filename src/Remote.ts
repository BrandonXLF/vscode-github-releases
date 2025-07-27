import * as vscode from 'vscode';
import * as git from './types/git';
import { Octokit } from '@octokit/rest';
import { exec } from 'child_process';
import fs from 'fs/promises';
import parseLinkHeader from 'parse-link-header';

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

export type PaginationMap = Map<
    'first' | 'prev' | 'next' | 'last',
    number | undefined
>;

function parsePaginationPage(
    links: parseLinkHeader.Links | null,
    type: string,
): number | undefined {
    return links?.[type]?.page ? +links[type].page : undefined;
}

export class Remote {
    public static readonly ReleasesPerPage = 40;

    private latestId: number | null = null;

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

    private async updateLatest() {
        const res = await this.octokit.repos.getLatestRelease({
            owner: this.owner,
            repo: this.name,
        });

        this.latestId = res.data.id;
    }

    async getReleases(page = 1) {
        await this.updateLatest();

        const res = await this.octokit.repos.listReleases({
            owner: this.owner,
            repo: this.name,
            per_page: Remote.ReleasesPerPage,
            page,
        });

        const releases = res.data.map<Release>((item) => ({
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

        const links = parseLinkHeader(res.headers.link);

        return {
            releases,
            pagination: new Map([
                ['first', parsePaginationPage(links, 'first')],
                ['prev', parsePaginationPage(links, 'prev')],
                ['next', parsePaginationPage(links, 'next')],
                ['last', parsePaginationPage(links, 'last')],
            ]) satisfies PaginationMap,
        };
    }

    isLatest(release: Release) {
        return this.latestId === release.id;
    }

    async getTags() {
        const res = await this.octokit.repos.listTags({
            owner: this.owner,
            repo: this.name,
        });

        return res.data.map((item) => item.name);
    }

    async getLocalTags() {
        const refs = (await this.localRepo.getRefs({})) ?? [];
        const tags = refs.filter((ref) => ref.type === git.RefType.Tag);

        tags.reverse();
        return tags.map((ref) => ref.name!);
    }

    async pushLocalTag(tag: string) {
        try {
            await new Promise<void>((resolve, reject) => {
                exec(
                    `git push ${this.localName} ${tag} --quiet`,
                    {
                        cwd: this.localRepo.rootUri.fsPath,
                    },
                    (_err, _stdout, stderr) =>
                        stderr ? reject(new Error(stderr)) : resolve(),
                );
            });

            return true;
        } catch (e) {
            vscode.window.showErrorMessage(
                `Failed to push local tag: ${(e as Error).message}`,
            );

            return false;
        }
    }

    async getBranches() {
        const res = await this.octokit.git.listMatchingRefs({
            owner: this.owner,
            repo: this.name,
            ref: 'heads',
        });

        return res.data.map((item) => item.ref.replace(/^refs\/heads\//, ''));
    }

    async getCommits() {
        const res = await this.octokit.repos.listCommits({
            owner: this.owner,
            repo: this.name,
        });

        return res.data.map((item) => ({
            sha: item.sha,
            message: item.commit.message.split('\n')[0],
        }));
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

    async updateOrPublishRelease(data: {
        id?: number;
        tag: string;
        target: string;
        title: string;
        desc: string;
        draft: boolean;
        prerelease: boolean;
        makeLatest: boolean;
    }) {
        const endpoint = data.id
            ? this.octokit.repos.updateRelease
            : this.octokit.repos.createRelease;

        try {
            const res = await endpoint({
                owner: this.owner,
                repo: this.name,
                release_id: data.id as number,
                tag_name: data.tag,
                target_commitish: data.target || undefined,
                name: data.title,
                body: data.desc,
                draft: data.draft,
                prerelease: data.prerelease,
                make_latest: data.makeLatest ? 'true' : 'false',
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

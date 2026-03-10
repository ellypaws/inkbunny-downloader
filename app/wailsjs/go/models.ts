export namespace types {
	
	export class AppSettings {
	    downloadDirectory: string;
	    downloadPattern: string;
	    maxActive: number;
	    darkMode: boolean;
	    motionEnabled: boolean;
	    autoClearCompleted: boolean;
	    skippedReleaseTag: string;
	    hasLoggedInBefore: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.downloadDirectory = source["downloadDirectory"];
	        this.downloadPattern = source["downloadPattern"];
	        this.maxActive = source["maxActive"];
	        this.darkMode = source["darkMode"];
	        this.motionEnabled = source["motionEnabled"];
	        this.autoClearCompleted = source["autoClearCompleted"];
	        this.skippedReleaseTag = source["skippedReleaseTag"];
	        this.hasLoggedInBefore = source["hasLoggedInBefore"];
	    }
	}
	export class BuildInfo {
	    version: string;
	    commit?: string;
	    displayVersion: string;
	    isDev: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BuildInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.commit = source["commit"];
	        this.displayVersion = source["displayVersion"];
	        this.isDev = source["isDev"];
	    }
	}
	export class DownloadJobSnapshot {
	    id: string;
	    submissionId: string;
	    fileId: string;
	    title: string;
	    username: string;
	    fileName: string;
	    previewUrl?: string;
	    fileExists: boolean;
	    status: string;
	    bytesWritten: number;
	    totalBytes: number;
	    progress: number;
	    error?: string;
	    attempt: number;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadJobSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.submissionId = source["submissionId"];
	        this.fileId = source["fileId"];
	        this.title = source["title"];
	        this.username = source["username"];
	        this.fileName = source["fileName"];
	        this.previewUrl = source["previewUrl"];
	        this.fileExists = source["fileExists"];
	        this.status = source["status"];
	        this.bytesWritten = source["bytesWritten"];
	        this.totalBytes = source["totalBytes"];
	        this.progress = source["progress"];
	        this.error = source["error"];
	        this.attempt = source["attempt"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class DownloadOptions {
	    saveKeywords: boolean;
	    maxActive: number;
	    downloadDirectory: string;
	    downloadPattern: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.saveKeywords = source["saveKeywords"];
	        this.maxActive = source["maxActive"];
	        this.downloadDirectory = source["downloadDirectory"];
	        this.downloadPattern = source["downloadPattern"];
	    }
	}
	export class SelectedSubmission {
	    submissionId: string;
	    fileIds?: string[];
	
	    static createFrom(source: any = {}) {
	        return new SelectedSubmission(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.submissionId = source["submissionId"];
	        this.fileIds = source["fileIds"];
	    }
	}
	export class DownloadSelection {
	    submissions: SelectedSubmission[];
	
	    static createFrom(source: any = {}) {
	        return new DownloadSelection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.submissions = this.convertValues(source["submissions"], SelectedSubmission);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class QueueSnapshot {
	    jobs: DownloadJobSnapshot[];
	    paused: boolean;
	    queuedCount: number;
	    activeCount: number;
	    completedCount: number;
	    failedCount: number;
	    cancelledCount: number;
	
	    static createFrom(source: any = {}) {
	        return new QueueSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.jobs = this.convertValues(source["jobs"], DownloadJobSnapshot);
	        this.paused = source["paused"];
	        this.queuedCount = source["queuedCount"];
	        this.activeCount = source["activeCount"];
	        this.completedCount = source["completedCount"];
	        this.failedCount = source["failedCount"];
	        this.cancelledCount = source["cancelledCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReleaseStatus {
	    currentVersion: string;
	    currentTag: string;
	    latestTag?: string;
	    releaseURL?: string;
	    updateAvailable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ReleaseStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.currentTag = source["currentTag"];
	        this.latestTag = source["latestTag"];
	        this.releaseURL = source["releaseURL"];
	        this.updateAvailable = source["updateAvailable"];
	    }
	}
	export class SessionInfo {
	    hasSession: boolean;
	    username: string;
	    isGuest: boolean;
	    avatarUrl: string;
	    ratingsMask: string;
	    settings: AppSettings;
	    lastSearchId?: string;
	    effectiveTheme?: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasSession = source["hasSession"];
	        this.username = source["username"];
	        this.isGuest = source["isGuest"];
	        this.avatarUrl = source["avatarUrl"];
	        this.ratingsMask = source["ratingsMask"];
	        this.settings = this.convertValues(source["settings"], AppSettings);
	        this.lastSearchId = source["lastSearchId"];
	        this.effectiveTheme = source["effectiveTheme"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SubmissionMediaFile {
	    fileId?: string;
	    fileName?: string;
	    mimeType?: string;
	    order: number;
	    previewUrl?: string;
	    screenUrl?: string;
	    fullUrl?: string;
	    thumbnailUrl?: string;
	    thumbnailUrlMedium?: string;
	    thumbnailUrlLarge?: string;
	    thumbnailUrlHuge?: string;
	    thumbnailUrlMediumNonCustom?: string;
	    thumbnailUrlLargeNonCustom?: string;
	    thumbnailUrlHugeNonCustom?: string;
	    thumbMediumX?: number;
	    thumbLargeX?: number;
	    thumbHugeX?: number;
	    thumbMediumNonCustomX?: number;
	    thumbLargeNonCustomX?: number;
	    thumbHugeNonCustomX?: number;
	
	    static createFrom(source: any = {}) {
	        return new SubmissionMediaFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileId = source["fileId"];
	        this.fileName = source["fileName"];
	        this.mimeType = source["mimeType"];
	        this.order = source["order"];
	        this.previewUrl = source["previewUrl"];
	        this.screenUrl = source["screenUrl"];
	        this.fullUrl = source["fullUrl"];
	        this.thumbnailUrl = source["thumbnailUrl"];
	        this.thumbnailUrlMedium = source["thumbnailUrlMedium"];
	        this.thumbnailUrlLarge = source["thumbnailUrlLarge"];
	        this.thumbnailUrlHuge = source["thumbnailUrlHuge"];
	        this.thumbnailUrlMediumNonCustom = source["thumbnailUrlMediumNonCustom"];
	        this.thumbnailUrlLargeNonCustom = source["thumbnailUrlLargeNonCustom"];
	        this.thumbnailUrlHugeNonCustom = source["thumbnailUrlHugeNonCustom"];
	        this.thumbMediumX = source["thumbMediumX"];
	        this.thumbLargeX = source["thumbLargeX"];
	        this.thumbHugeX = source["thumbHugeX"];
	        this.thumbMediumNonCustomX = source["thumbMediumNonCustomX"];
	        this.thumbLargeNonCustomX = source["thumbLargeNonCustomX"];
	        this.thumbHugeNonCustomX = source["thumbHugeNonCustomX"];
	    }
	}
	export class SubmissionCard {
	    submissionId: string;
	    submissionUrl?: string;
	    title: string;
	    description?: string;
	    descriptionHtml?: string;
	    username: string;
	    userUrl?: string;
	    typeName: string;
	    submissionTypeId: number;
	    ratingName: string;
	    isPublic: boolean;
	    pageCount: number;
	    updated: boolean;
	    fileName?: string;
	    mimeType?: string;
	    latestMimeType?: string;
	    previewUrl?: string;
	    latestPreviewUrl?: string;
	    screenUrl?: string;
	    fullUrl?: string;
	    thumbnailUrl?: string;
	    latestThumbnailUrl?: string;
	    thumbnailUrlMedium?: string;
	    thumbnailUrlLarge?: string;
	    thumbnailUrlHuge?: string;
	    thumbnailUrlMediumNonCustom?: string;
	    thumbnailUrlLargeNonCustom?: string;
	    thumbnailUrlHugeNonCustom?: string;
	    thumbMediumX?: number;
	    thumbLargeX?: number;
	    thumbHugeX?: number;
	    thumbMediumNonCustomX?: number;
	    thumbLargeNonCustomX?: number;
	    thumbHugeNonCustomX?: number;
	    userIconUrlSmall?: string;
	    userIconUrlMedium?: string;
	    userIconUrlLarge?: string;
	    favorite: boolean;
	    favoritesCount: number;
	    viewsCount: number;
	    badgeText?: string;
	    accent?: string;
	    mediaFiles?: SubmissionMediaFile[];
	    fileIds?: string[];
	    downloaded: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SubmissionCard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.submissionId = source["submissionId"];
	        this.submissionUrl = source["submissionUrl"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.descriptionHtml = source["descriptionHtml"];
	        this.username = source["username"];
	        this.userUrl = source["userUrl"];
	        this.typeName = source["typeName"];
	        this.submissionTypeId = source["submissionTypeId"];
	        this.ratingName = source["ratingName"];
	        this.isPublic = source["isPublic"];
	        this.pageCount = source["pageCount"];
	        this.updated = source["updated"];
	        this.fileName = source["fileName"];
	        this.mimeType = source["mimeType"];
	        this.latestMimeType = source["latestMimeType"];
	        this.previewUrl = source["previewUrl"];
	        this.latestPreviewUrl = source["latestPreviewUrl"];
	        this.screenUrl = source["screenUrl"];
	        this.fullUrl = source["fullUrl"];
	        this.thumbnailUrl = source["thumbnailUrl"];
	        this.latestThumbnailUrl = source["latestThumbnailUrl"];
	        this.thumbnailUrlMedium = source["thumbnailUrlMedium"];
	        this.thumbnailUrlLarge = source["thumbnailUrlLarge"];
	        this.thumbnailUrlHuge = source["thumbnailUrlHuge"];
	        this.thumbnailUrlMediumNonCustom = source["thumbnailUrlMediumNonCustom"];
	        this.thumbnailUrlLargeNonCustom = source["thumbnailUrlLargeNonCustom"];
	        this.thumbnailUrlHugeNonCustom = source["thumbnailUrlHugeNonCustom"];
	        this.thumbMediumX = source["thumbMediumX"];
	        this.thumbLargeX = source["thumbLargeX"];
	        this.thumbHugeX = source["thumbHugeX"];
	        this.thumbMediumNonCustomX = source["thumbMediumNonCustomX"];
	        this.thumbLargeNonCustomX = source["thumbLargeNonCustomX"];
	        this.thumbHugeNonCustomX = source["thumbHugeNonCustomX"];
	        this.userIconUrlSmall = source["userIconUrlSmall"];
	        this.userIconUrlMedium = source["userIconUrlMedium"];
	        this.userIconUrlLarge = source["userIconUrlLarge"];
	        this.favorite = source["favorite"];
	        this.favoritesCount = source["favoritesCount"];
	        this.viewsCount = source["viewsCount"];
	        this.badgeText = source["badgeText"];
	        this.accent = source["accent"];
	        this.mediaFiles = this.convertValues(source["mediaFiles"], SubmissionMediaFile);
	        this.fileIds = source["fileIds"];
	        this.downloaded = source["downloaded"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SearchResponse {
	    searchId: string;
	    page: number;
	    pagesCount: number;
	    resultsCount: number;
	    results: SubmissionCard[];
	    session: SessionInfo;
	
	    static createFrom(source: any = {}) {
	        return new SearchResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.searchId = source["searchId"];
	        this.page = source["page"];
	        this.pagesCount = source["pagesCount"];
	        this.resultsCount = source["resultsCount"];
	        this.results = this.convertValues(source["results"], SubmissionCard);
	        this.session = this.convertValues(source["session"], SessionInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SearchParams {
	    query: string;
	    joinType: string;
	    searchInKeywords: boolean;
	    searchInTitle: boolean;
	    searchInDescription: boolean;
	    searchInMD5: boolean;
	    unreadSubmissions: boolean;
	    artistNames: string[];
	    useWatchingArtists: boolean;
	    favoritesBy: string;
	    poolId: number;
	    scraps: string;
	    timeRangeDays: number;
	    submissionTypes: number[];
	    orderBy: string;
	    page: number;
	    perPage: number;
	    maxDownloads: number;
	    maxActive: number;
	    saveKeywords: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SearchParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.query = source["query"];
	        this.joinType = source["joinType"];
	        this.searchInKeywords = source["searchInKeywords"];
	        this.searchInTitle = source["searchInTitle"];
	        this.searchInDescription = source["searchInDescription"];
	        this.searchInMD5 = source["searchInMD5"];
	        this.unreadSubmissions = source["unreadSubmissions"];
	        this.artistNames = source["artistNames"];
	        this.useWatchingArtists = source["useWatchingArtists"];
	        this.favoritesBy = source["favoritesBy"];
	        this.poolId = source["poolId"];
	        this.scraps = source["scraps"];
	        this.timeRangeDays = source["timeRangeDays"];
	        this.submissionTypes = source["submissionTypes"];
	        this.orderBy = source["orderBy"];
	        this.page = source["page"];
	        this.perPage = source["perPage"];
	        this.maxDownloads = source["maxDownloads"];
	        this.maxActive = source["maxActive"];
	        this.saveKeywords = source["saveKeywords"];
	    }
	}
	export class SavedSearchTab {
	    id: string;
	    mode: string;
	    searchParams: SearchParams;
	    artistDraft: string;
	    artistAvatars: Record<string, string>;
	    artistValidation?: Record<string, string>;
	    searchResponse?: SearchResponse;
	    results: SubmissionCard[];
	    activeSubmissionId: string;
	    selectedSubmissionIds: string[];
	    searchCollapsed: boolean;
	    autoQueueEnabled: boolean;
	    trackedDownloadSubmissionIds: string[];
	    autoQueueNextRunAt: number;
	
	    static createFrom(source: any = {}) {
	        return new SavedSearchTab(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.mode = source["mode"];
	        this.searchParams = this.convertValues(source["searchParams"], SearchParams);
	        this.artistDraft = source["artistDraft"];
	        this.artistAvatars = source["artistAvatars"];
	        this.artistValidation = source["artistValidation"];
	        this.searchResponse = this.convertValues(source["searchResponse"], SearchResponse);
	        this.results = this.convertValues(source["results"], SubmissionCard);
	        this.activeSubmissionId = source["activeSubmissionId"];
	        this.selectedSubmissionIds = source["selectedSubmissionIds"];
	        this.searchCollapsed = source["searchCollapsed"];
	        this.autoQueueEnabled = source["autoQueueEnabled"];
	        this.trackedDownloadSubmissionIds = source["trackedDownloadSubmissionIds"];
	        this.autoQueueNextRunAt = source["autoQueueNextRunAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	export class UsernameSuggestion {
	    userId: string;
	    value: string;
	    username: string;
	    avatarUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new UsernameSuggestion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.userId = source["userId"];
	        this.value = source["value"];
	        this.username = source["username"];
	        this.avatarUrl = source["avatarUrl"];
	    }
	}
	export class WorkspaceState {
	    activeTabId: string;
	    tabs: SavedSearchTab[];
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activeTabId = source["activeTabId"];
	        this.tabs = this.convertValues(source["tabs"], SavedSearchTab);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}


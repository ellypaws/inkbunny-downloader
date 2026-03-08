export namespace desktopapp {
	
	export class AppSettings {
	    downloadDirectory: string;
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
	        this.maxActive = source["maxActive"];
	        this.darkMode = source["darkMode"];
	        this.motionEnabled = source["motionEnabled"];
	        this.autoClearCompleted = source["autoClearCompleted"];
	        this.skippedReleaseTag = source["skippedReleaseTag"];
	        this.hasLoggedInBefore = source["hasLoggedInBefore"];
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
	
	    static createFrom(source: any = {}) {
	        return new DownloadOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.saveKeywords = source["saveKeywords"];
	        this.maxActive = source["maxActive"];
	        this.downloadDirectory = source["downloadDirectory"];
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
	export class SearchParams {
	    query: string;
	    joinType: string;
	    searchInKeywords: boolean;
	    searchInTitle: boolean;
	    searchInDescription: boolean;
	    searchInMD5: boolean;
	    artistName: string;
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
	        this.artistName = source["artistName"];
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
	export class SubmissionCard {
	    submissionId: string;
	    title: string;
	    username: string;
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
	    badgeText?: string;
	    accent?: string;
	    fileIds?: string[];
	    downloaded: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SubmissionCard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.submissionId = source["submissionId"];
	        this.title = source["title"];
	        this.username = source["username"];
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
	        this.badgeText = source["badgeText"];
	        this.accent = source["accent"];
	        this.fileIds = source["fileIds"];
	        this.downloaded = source["downloaded"];
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

}


export namespace main {
	
	export class EnvInfo {
	    ffmpeg: string;
	    ffprobe: string;
	    ok: boolean;
	
	    static createFrom(source: any = {}) {
	        return new EnvInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ffmpeg = source["ffmpeg"];
	        this.ffprobe = source["ffprobe"];
	        this.ok = source["ok"];
	    }
	}

}

export namespace video {
	
	export class MediaInfo {
	    path: string;
	    name: string;
	    ext: string;
	    duration: number;
	    width: number;
	    height: number;
	    fps: number;
	    format: string;
	    videoCodec: string;
	    audioCodecs: string[];
	    audioCount: number;
	    subtitleCount: number;
	    chapterCount: number;
	    rotation: number;
	    sizeBytes: number;
	    needsProxy: boolean;
	    canFastTrim: boolean;
	
	    static createFrom(source: any = {}) {
	        return new MediaInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.ext = source["ext"];
	        this.duration = source["duration"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fps = source["fps"];
	        this.format = source["format"];
	        this.videoCodec = source["videoCodec"];
	        this.audioCodecs = source["audioCodecs"];
	        this.audioCount = source["audioCount"];
	        this.subtitleCount = source["subtitleCount"];
	        this.chapterCount = source["chapterCount"];
	        this.rotation = source["rotation"];
	        this.sizeBytes = source["sizeBytes"];
	        this.needsProxy = source["needsProxy"];
	        this.canFastTrim = source["canFastTrim"];
	    }
	}

}


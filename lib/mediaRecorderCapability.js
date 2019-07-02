const EventEmitter = require('wolfy87-eventemitter');
const os = require("os");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const {spawn} = require("child_process");
const rimraf = require("rimraf");

const RECORDER_STATS = {
    inactive: "inactive",
    recording: "recording",
    paused: "paused",
};

const addMediaRecorderCapability = (self)=>{
    self.state = RECORDER_STATS.inactive;

    self.videoTrackProcessors = [];
    const now = new Date();
    self.tempPath = path.join(os.tmpdir(), `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`);
    self.sliceId = 0;

    self.start = ()=>{
        if (self.state !== RECORDER_STATS.inactive){
            var errInfo = `Failed to call MediaRecorder.start(). Invalid State ${self.state}`;
            console.error(errInfo);
            return;
        }
        self.state = RECORDER_STATS.recording;
        fs.mkdirSync(self.tempPath);
        self.mediaStream.getVideoTracks().forEach((videoTrack, index)=>{
            self._processVideoTrack(videoTrack, index);
        });
    };

    self._processVideoTrack = (videoTrack, index)=>{
        const processor = createVideoTrackProcessor(videoTrack, self.wrtc);
        self.videoTrackProcessors[index] = processor;
        processor.on('change', async function(){
            const dumpDir = path.join(self.tempPath, `slice_${self.sliceId}`);
            fs.mkdirSync(dumpDir);
            const info = {
                slice: self.sliceId,
                dumpDir: dumpDir,
                video: []
            };
            for (let i = 0; i < self.videoTrackProcessors.length; i ++){
                let processor = self.videoTrackProcessors[i];
                const result = await processor.dump(dumpDir);
                if (result){
                    info.video[i] = result;
                }
            }
            const configPath = path.join(dumpDir, `config.json`);
            fs.writeFileSync(configPath, JSON.stringify(info, null, 2));
            const compressTarget = path.join(self.tempPath, `slice_${self.sliceId}.mp4`);
            self.compress(configPath, compressTarget).then(function(){
                const evt = {filePath: compressTarget};
                self.emit('dataavailable', evt);
                if (self.ondataavailable){
                    self.ondataavailable(evt);
                }
            });
            self.sliceId++;
        });
    };

    self.compress = async (configPath, compressTarget)=>{
        return new Promise(async (resolve, reject)=>{
            const configBody = await fsPromises.readFile(configPath, {
                encoding: 'utf-8'
            });
            const config = JSON.parse(configBody);
            let command = path.join(__dirname, os.platform(), os.arch(), 'ffmpeg');
            if (!fs.existsSync(command)){
                command = "ffmpeg";
            }
            const args = [
                "-pix_fmt", "yuv420p",
                "-s",   `${config.video[0].width}x${config.video[0].height}`,
                "-r", `${config.video[0].frameRate}`,
                "-i", `${config.video[0].dumpPath}`,
                `${compressTarget}`
            ];
            const cp = spawn(command, args);
            cp.on('close', (code)=>{
                console.log("Process finished with code", code);
                if (code){
                    reject(code);
                }else{
                    if (config.dumpDir){
                        console.log(`Deleting folder ${config.dumpDir}`);
                        rimraf(config.dumpDir, function(err){
                            if (err){
                                console.error(`Failed to delete folder ${config.dumpDir}`, err);
                                reject(err);
                            }else{
                                resolve();
                            }
                        });
                    }else{
                        resolve();
                    }
                }
            });
        });
    };
};

const createVideoTrackProcessor = function(videoTrack, wrtc){
    const self = new EventEmitter();
    self.width = null;
    self.height = null;
    self.startAt = null;
    self.frameRate = null;
    self.track = videoTrack;
    const sink = new wrtc.nonstandard.RTCVideoSink(videoTrack);
    self.sink = sink;
    self.dataLengthMax = 1e9;
    self.frames = [];
    self.currentFrame = null;
    sink.onframe = ({frame})=>{
        frame.receivedAt = Date.now();
        if (!self.width){
            self.width = frame.width;
            self.height = frame.height;
            self.rotation = frame.rotation;
        }
        if (self.width !== frame.width || self.height !== frame.height){
            self.emit('change');
        }else if (self.getDataLength() >= self.dataLengthMax) {
            self.emit('change');
        }
        self.frames.push(frame);
    };

    self.getDataLength = function() {
        let dataLength = 0;
        self.frames.forEach(function(frame) {
            dataLength += frame.data.byteLength;
        });
        return dataLength;
    };

    self.dump = async function(dumpDir){
        const frames = self.frames;
        self.frames = [];
        let width = null;
        let height = null;
        let frameRate = null;
        let duration = null;
        let frameByteLength = null;
        if (frames.length) {
            width = frames[0].width;
            height = frames[0].height;
            frameByteLength = frames[0].data.byteLength;
            duration = frames[frames.length - 1].receivedAt - frames[0].receivedAt;
            if (duration){
                frameRate = Math.ceil((frames.length - 1) / duration * 1000);
            }
            const dumpPath = path.join(dumpDir, `video_${width}x${height}x${frameRate}_${duration}_${frameByteLength}.yuv`);
            const start = Date.now();
            for (let i = 0; i < frames.length; i++){
                await fsPromises.appendFile(dumpPath, frames[i].data);
            }
            console.log(`Dumped file ${dumpPath} ${Math.floor((Date.now() - start) / 1000)}s`);
            return {
                dumpPath,
                width,
                height,
                frameRate,
                duration,
                frameByteLength,
            };
        }
    };

    return self;
};

module.exports = {
    addMediaRecorderCapability
};
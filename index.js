const EventEmitter = require('wolfy87-eventemitter');
const {addMediaRecorderCapability} = require("./lib/mediaRecorderCapability");

const RECORDER_STATS = {
    inactive: "inactive",
    recording: "recording",
    paused: "paused",
};

module.exports = (wrtc)=>{
    console.log("Media Recorder imported");
    const MediaRecorder = function (mediaStream){
        const self = new EventEmitter();
        self.wrtc = wrtc;
        self.mediaStream = mediaStream;

        addMediaRecorderCapability(self);

        return self;
    };

    return MediaRecorder;
};
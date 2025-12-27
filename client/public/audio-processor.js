class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 2048; // Reduced latency
        this.buffer = new Float32Array(this.bufferSize);
        this.bytesWritten = 0;
        this.frameCount = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];

        // Debug log every ~3 seconds (assuming 48kHz, 128 quantum = ~375 calls/sec)
        this.frameCount++;
        if (this.frameCount % 1000 === 0) {
            console.log(`[AudioWorklet] Processing frame ${this.frameCount}, input channels: ${input?.length}`);
        }

        if (input && input.length > 0) {
            const channel0 = input[0];

            // Check if we have data
            if (channel0 && channel0.length > 0) {
                // If buffer is full, flush it
                if (this.bytesWritten + channel0.length >= this.bufferSize) {
                    this.port.postMessage(this.buffer.slice(0, this.bytesWritten));
                    this.bytesWritten = 0;
                }

                // Append new data
                this.buffer.set(channel0, this.bytesWritten);
                this.bytesWritten += channel0.length;
            }
        }

        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);

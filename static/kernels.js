
const canvasParent = document.getElementById('canvas-parent');
const weirdFilter = document.getElementById('weird-filter');
const gpuEnabled = document.getElementById('gpu-enabled');
const fpsNumber = document.getElementById('fps-number');
let lastCalledTime = Date.now();
let fps;
let delta;
let dispose = setup();
gpuEnabled.onchange = () => {
    if (dispose) dispose();
    dispose = setup();
};
function setup() {
    let disposed = false;
    const gpu = new GPU({ mode: gpuEnabled.checked ? 'gpu' : 'cpu' });

    // basically a kernel that changes the input to greyscale by averaging the total of each channel. (makes the most sense to me.)
    const grayscaleKernel = gpu.createKernel(function (frame, weirdFilter) {

        const pixel = frame[this.thread.y][this.thread.x];
        if (weirdFilter) {
            const a = (pixel[0] + pixel[1] + pixel[2]) / 3;
            this.color(a, a, a, 1);
        } else {
            this.color(pixel.r, pixel.g, pixel.b, pixel.a);
        }
    }, {
        output: [1024, 768],
        graphical: true,
        tactic: 'precision',
        pipeline: true
    });

    // A primitive kernel that assumes that something is lit if the average of all channels is > lightLevel Then flip it over.
    //lightLevel is 0 to 1.
    const litObjFinderKernel = gpu.createKernel(function (frame, weirdFilter, lightLevel) {
        const pixel = frame[this.thread.y][this.thread.x];
        if (weirdFilter) {
            const a = (((pixel[0] + pixel[1] + pixel[2]) / 3) < lightLevel) ? 0 : 1;

            this.color(a, a, a, 1);
        } else {
            this.color(pixel.r, pixel.g, pixel.b, pixel.a);
        }
    }, {
        output: [1024, 768],
        graphical: true,
        tactic: 'precision',
        pipeline: true
    });


    // A primitive kernel that swaps any non-black to a specific color. for debugging pipelining.
    // color is an array with 3 floats from 0 to 1
    const colorReplaceKernel = gpu.createKernel(function (frame, weirdFilter, color) {
        const pixel = frame[this.thread.y][this.thread.x];
        if (weirdFilter) {
            if(pixel.r > 0 || pixel.g > 0 || pixel.b > 0)
            {
                this.color(color[0], color[1], color[2], 1);
            }
            else{
                this.color(pixel.r, pixel.g, pixel.b, pixel.a);
            }
        } else {
            this.color(pixel.r, pixel.g, pixel.b, pixel.a);
        }
    }, {
        output: [1024, 768],
        graphical: true,
        tactic: 'precision'
    });

    //borrowed from kernel1.js. is essentially a 3x3 matrix kernel.
    const matrixKernel = gpu.createKernel(function (frame, weirdFilter, k) {
        const pixel = frame[this.thread.y][this.thread.x];
        var col = [0, 0, 0];
        if (weirdFilter) {
            if (this.thread.y > 0 && this.thread.y < 768 - 2 && this.thread.x < 1024 - 2 && this.thread.x > 0) {

                const a0 = frame[this.thread.y + 1][this.thread.x - 1];
                const a1 = frame[this.thread.y + 1][this.thread.x];
                const a2 = frame[this.thread.y + 1][this.thread.x + 1];
                const a3 = frame[this.thread.y][this.thread.x - 1];
                const a4 = frame[this.thread.y][this.thread.x];
                const a5 = frame[this.thread.y][this.thread.x + 1];
                const a6 = frame[this.thread.y - 1][this.thread.x - 1];
                const a7 = frame[this.thread.y - 1][this.thread.x];
                const a8 = frame[this.thread.y - 1][this.thread.x + 1];
                for (var i = 0; i < 3; i++) {       // Compute the convolution for each of red [0], green [1] and blue [2]
                    col[i] = a0[i] * k[0] + a1[i] * k[1] + a2[i] * k[2] + a3[i] * k[3] + a4[i] * k[4] + a5[i] * k[5] + a6[i] * k[6] + a7[i] * k[7] + a8[i] * k[8];
                }
                this.color(col[0], col[1], col[2], 1);
            } else {
                this.color(pixel.r, pixel.g, pixel.b, pixel.a);
            }
        } else {
            this.color(pixel.r, pixel.g, pixel.b, pixel.a);
        }
    }, {
        output: [1024, 768],
        graphical: true,
        tactic: 'precision',
        pipeline: true
    });

    canvasParent.appendChild(colorReplaceKernel.canvas);
    const videoElement = document.querySelector('video');

    function render() {
        if (disposed) {
            return;
        }
        const result1 = litObjFinderKernel(videoElement, weirdFilter.checked, 0.1);
        const result2 = matrixKernel(result1, weirdFilter.checked, [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625]); //this is for blurring
        const result3 = colorReplaceKernel(result2, weirdFilter.checked, [1, 0, 0]);
        // const result1 = grayscaleKernel(videoElement, weirdFilter.checked);
        // litObjFinderKernel(videoElement, weirdFilter.checked, 0.1);
        //matrixKernel(videoElement, weirdFilter.checked, [-1, -1, -1, -1, 8, -1, -1, -1, -1]); //this is for outlines
        // matrixKernel(videoElement, weirdFilter.checked, [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625]); //this is for blurring
        window.requestAnimationFrame(render);
        calcFPS();
    }

    render();
    return () => {
        canvasParent.removeChild(colorReplaceKernel.canvas);
        gpu.destroy();
        disposed = true;
    };
}

function streamHandler(stream) {
    try {
        video.srcObject = stream;
    } catch (error) {
        video.src = URL.createObjectURL(stream);
    }
    video.play();
    console.log("In startStream");
    requestAnimationFrame(render);
}


addEventListener("DOMContentLoaded", initialize);

function calcFPS() {
    delta = (Date.now() - lastCalledTime) / 1000;
    lastCalledTime = Date.now();
    fps = 1 / delta;
    fpsNumber.innerHTML = fps.toFixed(0);
}

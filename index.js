const video = document.createElement('video')
video.setAttribute('id','webcamVideo')
video.setAttribute('muted','true')

let canvasNum = 5
let canvasArr = []

function setupCanvases(width, height){
    for(let i = 0; i < canvasNum; i++){
        let canvas = document.createElement('canvas')
        canvas.setAttribute('id', 'canvas'+i)
        canvas.setAttribute('width', width)
        canvas.setAttribute('height', height)
        document.body.appendChild(canvas)
        canvasArr.push(canvas)
    }
}

sliders = []
function addSlider(desc, min, max, val){
    if(min > max || val > max || val < min){
        console.log('Tried to create slider with bad min,max,value. Returning')
        return
    }
    let div = document.createElement('div')
    let label = document.createElement('label')
    let slider = document.createElement('input')
    slider.setAttribute('name',desc)
    slider.setAttribute('type','range')
    slider.setAttribute('min',min)
    slider.setAttribute('max',max)
    slider.setAttribute('value',val)

    label.textContent = desc+' : '+val

    document.body.appendChild(div)
    div.appendChild(slider)
    div.appendChild(label)
    
    slider.addEventListener('input', (event) =>{
        let labels = event.target.parentElement.getElementsByTagName('label')
        if(labels.length == 0){
            console.log('Slider input updated, but no label? Returning')
            return
        }
        labels[0].textContent = event.target.name+' : '+event.target.value
    })
    

    sliders.push(slider)
}

/**
 * @param {cv.Mat} mat 
 * @param {number} x 
 * @param {number} y 
 * @returns true if point is in Mat, false otherwise
 */
function isPointInMat(mat, x, y){
    if(!mat?.data32S?.constructor === Int32Array){
        console.log("TypeWarning: mat is not a cv.mat like. returning false")
        return false
    }

    let starti = 0
    let len = mat.data32S.length
    while(starti < mat.data32S.length){
        let i = mat.data32S.indexOf(x, starti)
        if(i == -1 || i+1 >= len){
            return false
        }

        if(mat.data32S[i+1] == y){
            return true
        }

        starti = i+1
    }

    return false
}

function arePointsSimilar(x1,y1,x2,y2,tol){
    let distSquared = (x1-x2)*(x1-x2) + (y1-y2)*(y1-y2)
    return distSquared <= tol
}

/**
 * @param {cv.Mat} mat1
 * @param {cv.Mat} mat2
 * @param {number} tol tolerance in pixel distance squared for point similarity
 * @returns true if matrices have similar points, false otherwise
 */
function areMatsSimilar(mat1, mat2, tol){
    if(!mat1?.data32S?.constructor === Int32Array){
        console.log("TypeWarning: mat1 is not a cv.mat like. returning false")
        return false
    }
    if(!mat2?.data32S?.constructor === Int32Array){
        console.log("TypeWarning: mat2 is not a cv.mat like. returning false")
        return false
    }

    // mats with different number of points are not similar
    if(mat1.data32S.length != mat2.data32S.length){
        return false
    }

    let len = mat1.data32S.length

    offsetLoop:
    for(let off=0; off<len; off+=2){
        if(!arePointsSimilar(mat1.data32S[0],mat1.data32S[1],mat2.data32S[off],mat2.data32S[off+1],tol)){
            continue offsetLoop
        }
        for(let j=0; j<len; j+=2){
            // adjust j for current offset in mat2
            let jOff = off + j < len ? off + j : len - (off + j)
            if(!arePointsSimilar(mat1.data32S[j],mat1.data32S[j+1],mat2.data32S[jOff],mat2.data32S[jOff+1],tol)){
                continue offsetLoop
            }
        }
        return true
    }
    return false
}

navigator.getUserMedia = (
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia
);

//request webcam access
navigator.getUserMedia (
{
    video: true,
    audio: false
},
// success callback
function(stream) {
    console.log('Successfully got access to camera')
    let {width, height} = stream.getTracks()[0].getSettings()
    console.log("Got (w.h) from stream settings ("+width+", "+height+")")
    video.srcObject = stream
    video.play()

    setupCanvases(width,height)

    //setup sliders for adjusting opencv params
    //bilat filter
    addSlider('PixelSize', 1, 64, 7)
    addSlider('SigmaColor', 0, 255, 50)
    addSlider('PixelSize', 0, 255, 50)
    //Canny
    addSlider('Thresh1', 0, 255, 20)
    addSlider('Thresh2', 0, 255, 60)
    //HoughLines
    addSlider('Rho', 1, 255, 1)
    addSlider('Theta', 1, 360, 180)
    addSlider('Thresh', 0, 64, 2)
    addSlider('Srn', 0, 255, 0)
    addSlider('Stn', 0, 255, 0)
    
},
// fail callback
function(err) {
    console.log('Failed to get webcam access: '+err)
}
);

const Arrow = function(mat, tip, tail){
    this.mat = mat
    this.stability = ARROW_INIT_STABILITY
    this.tip = tip
    this.tail = tail
}

const Arrows = []
const ARROW_TOLERANCE = 49
const ARROW_MAX_STABILITY = 10
const ARROW_STABILITY_THRESHOLD = 2
const ARROW_INIT_STABILITY = 0

//main processing loop.
function processFrame(timestamp){
    let ctx = canvasArr[0].getContext('2d')
    ctx.drawImage(video, 0, 0, canvasArr[0].width, canvasArr[0].height)

    //create some temporary matrices. must call delete() on cv.Mat objects when done
    let mat1 = cv.imread(canvasArr[0].id)
    let mat2 = cv.Mat.zeros(mat1.rows, mat1.cols, cv.CV_8UC3)
    let dst = cv.Mat.zeros(mat1.rows, mat1.cols, cv.CV_8UC3)
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    let green = new cv.Scalar(0,255,0)
    let red = new cv.Scalar(255,0,0)
    let blue = new cv.Scalar(0,0,255)
    let dark_green = new cv.Scalar(13, 66, 24)
    let purple = new cv.Scalar(179,0,255)
    let orange = new cv.Scalar(255,145,0)
    
    //Gray scale
    cv.cvtColor(mat1, mat2, cv.COLOR_RGBA2GRAY)
    cv.imshow(canvasArr[1].id, mat2)

    //bilateral filter
    cv.bilateralFilter(mat2, mat1, parseInt(sliders[0].value), parseInt(sliders[1].value), parseInt(sliders[2].value), cv.BORDER_DEFAULT) // cv.bilateralFilter( src, dst, d, sigmaColor, sigmaSpace[, dst[, borderType]] )
    cv.imshow(canvasArr[2].id, mat1)

    //Canny
    cv.Canny(mat1, mat2, parseInt(sliders[3].value), parseInt(sliders[4].value), 3)
    cv.imshow(canvasArr[3].id, mat2)

    //Image closing
    let matOnes = cv.Mat.ones(5, 5, cv.CV_8U)
    cv.morphologyEx(mat2, mat1, cv.MORPH_CLOSE, matOnes)
    cv.imshow(canvasArr[3].id, mat1)
    matOnes.delete()

    // Contours
    cv.findContours(mat1, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE) // TODO experiment with cv constants here. BIG difference
    
    let polys = new cv.MatVector()

    for(let i=0; i<contours.size(); i++){
        let cnt = contours.get(i)
        
        let poly = new cv.Mat()
        let hull = new cv.Mat()

        perimeter = cv.arcLength(cnt, true)
        cv.approxPolyDP(cnt, poly, 0.025*perimeter, true)

        polys.push_back(poly)
        
        //let rect = cv.boundingRect(cnt)
        //let area = rect.width*rect.height

        cv.convexHull(poly, hull, false, true)

        let sides = hull.size().height

        if((sides == 5 || sides == 4) && sides + 2 == poly.size().height){
            //ignore small polygons
            let cntArea = cv.contourArea(cnt)
            //console.log(cntArea)
            if(cntArea < 50){
                continue
            }
            
            // find points in poly, but not in hull (already checked that there are exactly 2)
            // these points can help us find the tip (and tail)

            // index of two points in poly we are looking for
            let pointIndex1 = -1, pointIndex2 = -1

            let polylen = poly.data32S.length

            // check all poly points for presence in hull. Store poly indices of points that are not in hull.
            for(let j=0; j<polylen; j+=2){
                let polyx = poly.data32S[j]
                let polyy = poly.data32S[j+1]

                if(!isPointInMat(hull, polyx, polyy)){
                    if(pointIndex1 == -1){
                        pointIndex1 = j
                        continue
                    }
                    if(pointIndex2 == -1){
                        pointIndex2 = j
                        break
                    }
                }
            }
            
            // tip candidate indices
            let p1p2 = pointIndex1 + 4 < polylen ? pointIndex1 + 4 : polylen - (pointIndex1 + 4)
            let p1m2 = pointIndex1 - 4 >= 0 ? pointIndex1 - 4 : polylen + (pointIndex1 - 4)
            let p2p2 = pointIndex2 + 4 < polylen ? pointIndex2 + 4 : polylen - (pointIndex2 + 4)
            let p2m2 = pointIndex2 - 4 >= 0 ? pointIndex2 - 4 : polylen + (pointIndex2 - 4)

            let tip = null, tail = null
            if(p1p2 == p2m2){
                tip = new cv.Point(poly.data32S[p1p2],poly.data32S[p1p2+1])
                tail = new cv.Point((poly.data32S[p1m2]+poly.data32S[p2p2])/2,(poly.data32S[p1m2+1]+poly.data32S[p2p2+1])/2)
            }else if(p1m2 == p2p2){
                tip = new cv.Point(poly.data32S[p1m2],poly.data32S[p1m2+1])
                tail = new cv.Point((poly.data32S[p1p2]+poly.data32S[p2m2])/2,(poly.data32S[p1p2+1]+poly.data32S[p2m2+1])/2)
            }else{
                //not an arrow
                continue
            }

            // check arrow for a similar known one
            let isKnown = false
            arrowLoop:
            for(let j=0; j<Arrows.length; j++){
                if(areMatsSimilar(poly, Arrows[j].mat, ARROW_TOLERANCE)){
                    // update arrow
                    Arrows[j].mat.delete()
                    Arrows[j].mat = poly
                    Arrows[j].stability += 2
                    Arrows[j].stability = Math.min(Arrows[j].stability, ARROW_MAX_STABILITY)
                    Arrows[j].tip = tip
                    Arrows[j].tail = tail
                    isKnown = true
                    break arrowLoop;
                }
            }
            if(!isKnown){
                // add arrow to known arrows
                Arrows.push(new Arrow(poly,tip,tail))
            }    
        }
        // clean-up cv.mat's
        cnt.delete();hull.delete();
    }

    // remove stale arrows and add stable arrows to a cv.matVector
     let stableArrows = new cv.MatVector()
    for(let i=0; i<Arrows.length; i++){
        if(Arrows[i].stability < 0){
            Arrows[i].mat.delete()
            Arrows.splice(i,1)
            i--
            continue
        }
        if(Arrows[i].stability > ARROW_STABILITY_THRESHOLD){
            stableArrows.push_back(Arrows[i].mat)
            // draw tip and tail here for convenience
            cv.circle(dst, Arrows[i].tip, 3, red, cv.FILLED)
            cv.circle(dst, Arrows[i].tail, 3, green, cv.FILLED)
        }
        //update stability
        Arrows[i].stability--
    }
    
    // draw stable arrows
    for(let i=0; i<stableArrows.size(); i++){
        cv.drawContours(dst, stableArrows, i, blue, 1, 8, hierarchy, 0)
    }
    
    cv.imshow(canvasArr[4].id, dst)

    mat1.delete();mat2.delete();dst.delete();contours.delete();hierarchy.delete();polys.delete();stableArrows.delete();
    

    window.requestAnimationFrame(processFrame)         
}

video.addEventListener('play',(event) =>{
    console.log('Webcam started playing to video element')
    window.requestAnimationFrame(processFrame)
})
const cors = require("cors")({origin: true});
const os = require("os");
const path = require("path");
const Busboy = require("busboy");
const {Storage} = require("@google-cloud/storage");
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');


// This function accepts HTTP PUT method and a file.
// If the file is not mp3, flac, or wav - function fails.
// If the file is mp3 it is converted to a mono wav.
// If the file is flac or wav it is converted to mono and keeps same ext.
// The file is then sent to google cloud storage and picked up
// by publish_audio_file_metadata_to_file_upload_completed_topic to continue the STT process.
//
// ENTRY POINT: 
// uploadFile(req, res)
//
// HELPER AUDIO FORMATTING FUNCTIONS:
// convertMp3ToWav(ogFilepath, finalFilepath)
// convertToMono(ogFilepath, finalFilepath)
// getFileMetadata(filepath)



/////////////////////////////////////////////////////////////////////////////////////
// AUDIO FORMATTING FUNCTIONS ///////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

// Use ffmpeg to convert mpeg or mp3 to wav
function convertMp3ToWav(ogFilepath, finalFilepath) {
  return new Promise((resolve, reject) => {

    // log all files in /tmp
    fs.readdir('/tmp/', (err, files) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Files', files);
      }
    });

    
     ffmpeg(ogFilepath)
      .inputFormat('mp3')
      .audioChannels(1)
      .audioCodec('pcm_s16le') // should test transcription accuracy with different codecs
      .format('wav')
      .save(finalFilepath)
      .on('end', () => {
        console.log("Converted file to wav")
        return resolve({success: "success"});
      })
      .on('err', (err) => {
        console.log("could not convert file");
        console.log(err);
        return reject(err);
      });
  });
}

// Use ffmpeg to convert to single audio channel (mono) as required by STT api
function convertToMono(ogFilepath, finalFilepath) {
  return new Promise((resolve, reject) => {

    // log all files in /tmp
    fs.readdir('/tmp/', (err, files) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Files', files);
      }
    });
    
     ffmpeg(ogFilepath)
      .audioChannels(1)
      .save(finalFilepath)
      .on('end', () => {
        console.log("Converted file to 1 channel (mono)")
        return resolve({success: "success"});
      })
      .on('err', (err) => {
        console.log("could not process file");
        console.log(err);
        return reject(err);
      });
  });
}

// Use ffprobe to get File Metadata - mainly for sample rate, but
// other data here may be useful for optimization as well
function getFileMetadata(filepath) {
  return new Promise((resolve, reject) => {

    // log all files in /tmp
    fs.readdir('/tmp/', (err, files) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Files', files);
      }
    });
    
    ffmpeg.ffprobe(filepath, 
      function(err, metadata) { 
        if (err) {
          console.log("could not get metadata");
          console.log(err);
          return reject(err);
        } else {
          console.log(`got metadata!`);
          return resolve(metadata);
        }
      });
    });
}

/////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////

// ENTRY POINT
exports.uploadFile = (req, res) => {
  // enable cors to run from browser
    cors(req, res, () => {
      console.log("running");
      // only allow PUT method
      if (req.method !== "PUT") {
        return res.status(500).json({message: "Not allowed"});
      }

      // Use busboy library to handle file upload
      const busboy = new Busboy({ headers: req.headers });

      // Initialize data needed for file manipulation and saving to gcs
      let uploadData = null;
      let needToConvert = false;

      let ogFilepath = "";
      let ogFilename = "";
      let newFilename = "";
      let finalFilepath = "";
      let finalMimetype = "";

      ///////////////////////////////////////////////////////////////////////////////
      // Once the file starts uploading to the function ...
      busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        console.log("reading file with busboy");

        // Generate new uuid for file
        newUuid = uuidv4();
        
        // create a name for the file with uuid and create an original filepath in /tmp/
        ogFilename = filename;
        cleanedFilename = filename.replace(/\s+/g, '');
        ogFilepath = path.join(os.tmpdir(), cleanedFilename);

        console.log(`ogFilepath: ${ogFilepath} || encoding: ${encoding} || mimetype: ${mimetype}`);


        // Get the file extension to check if conversion is necessary
        let fileExt = path.extname(ogFilepath);
        console.log(`fileExt is ${fileExt}`);

        // if flac or wav, use original filepath (with prepended uuid) and mimetype
        if (fileExt == ".flac" || fileExt == ".wav") {
          newFilename = `${newUuid}_${cleanedFilename}`
          finalFilepath = path.join(os.tmpdir(), newFilename);
          finalMimetype = mimetype;

        // if mp3 or mpeg, flag for conversion to wav and create a new filepath (with prepended uuid) with .wav extension
        } else if (fileExt == ".mp3" || fileExt == ".mpeg") {
          needToConvert = true;
          finalMimetype = "audio/wav";
          newFilename = `${newUuid}_${path.basename(ogFilepath, fileExt)}.wav`
          finalFilepath = path.join(os.tmpdir(), newFilename);
        } 
        
        // else, return error to client
        else {
            res.status(500).json({error: "only handling flac, wav, or mp3"});
        }

        console.log("create write stream with file");

        // Write the file to /tmp/ using the original filepath
        file.pipe(fs.createWriteStream(ogFilepath));
      });


      /////////////////////////////////////////////////////////////////////////////////////
      // Once file is done writing to /tmp/ .... 
      busboy.on('finish', async () => {

        console.log(`ogFilepath: ${ogFilepath} || finalFilepath: ${finalFilepath}`)

        // If file needs to be converted to .wav, then convert and save as new file
        if (needToConvert == true){
          let convertOutput = await convertMp3ToWav(ogFilepath, finalFilepath);
          console.log(`convert file output: ${JSON.stringify(convertOutput)}`); 
        }
        // Otherwise, mono it just in case and save as new file
        else {
          let convertOutput = await convertToMono(ogFilepath, finalFilepath);
          console.log(`convert file output: ${JSON.stringify(convertOutput)}`); 
        }

        // Finalize data for uploading to gcs
        uploadData = {file: finalFilepath, type: finalMimetype}

        // Get sample rate
        let metadata = await getFileMetadata(finalFilepath);
        console.log(`audio file metadata: ${JSON.stringify(metadata)}`)


        // Upload to storage bucket; also insert mimetype, sample rate, and uuid into file's metadata
        console.log("init storage bucket");
        const storage = new Storage();
        const bucket = storage.bucket('chatdesk-audio-transcription-files');

        console.log("uploading to storage bucket...");
        bucket.upload(uploadData.file, {
          uploadType: 'media',
          metadata: {
            metadata: {
              contentType: uploadData.type,
              sampleRate: metadata["streams"][0]["sample_rate"],   // sample_rate should be in streams[0] for mono file, but should test with more files
                                                                   // to better understand the ffprobe response
              uuid: newUuid,
              originalFilename: ogFilename
            }
          }
        }).then(() => {
          console.log("success!")
          res.status(200).json({
            "message": "File uploaded successfully!",
            "uuid": newUuid,
            "finalFilename": newFilename,
            "originalFilename": ogFilename
          });
        })
        .catch(err => {
          console.log("error")
          res.status(500).json({error: err});
        });
      });

    // apparently necessary to end like this in google cloud functions
    busboy.end(req.rawBody);
    });
}

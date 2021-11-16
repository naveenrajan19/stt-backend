const {Firestore} = require('@google-cloud/firestore');
const cors = require("cors")({origin: true});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// This function queries firestore for the document with the uuid provided in the original upload function.
// If isLoop = 'true' and the document is not found, the function will try again 
// after 2 seconds. The function will do this for the total number of times declared
// in the while loop e.g. (while (i < 75)).
// If isLoop is not = 'true' then the function will return "not found".

exports.getTranscript = async (req, res) => {
  // enable cors to run from browser
    cors(req, res, async () => {
      console.log("running");
      
      // only allow GET method
      if (req.method !== "GET") {
        return res.status(500).json({message: "Not allowed"});
      }

      let isLoop = req.query.isLoop.toLowerCase();
      let uuid = req.query.uuid;
      let i = 0;

      const db = new Firestore();
      while (i < 75) {
        // get reference of firestore document
        const transcriptionRef = db.collection('audio_transcriptions').doc(uuid)
        const transcriptionData = await transcriptionRef.get();

        // if document exists, return the data
        if (transcriptionData.exists) {
          console.log(transcriptionData);
          isLoop = "";
          return res.status(200).json({ data: transcriptionData.data().transcription });
        }
        // else try again, or return
        else {
          if (isLoop == "true") {
            console.log(`Doesn't exist yet, trying again: loop# ${i}`);
            i = i + 1;
          } else {
            return res.status(200).json({ data: "file transcript not found" });
          }

          // sleep for two seconds and try again
          await sleep(2000);
        }
      }

      // if document is not found, you can increase the numebr in the while loop. Using i < 75, total runtime is a little over 150 seconds.
      // Cloud functions can run for a total of 9 minutes (I have already increased the timeout for the transcription function to 9 min)
      return res.status(200).json({ data: "This is a simple demo. To help keep costs low, please use a smaller audio file." });
   });
}
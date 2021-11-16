const {Firestore} = require('@google-cloud/firestore');
const db = new Firestore();


// This function is subscribed to pubsub topic:  audio-transcriptions
// Takes the output of speech to text api, manipulates the transcriptions into
// a single string, and then inserts it into the audio_transcriptions firestore collection
// using the uuid assigned in the file upload function as  the unique id.
//
// Presently this function only handles speech-to-text responses from RecognitionConfig objects
// of this kind:
/*
     config_object = speech.RecognitionConfig(
        sample_rate_hertz=sample_rate,
        encoding=encoding,
        enable_automatic_punctuation=True,
        language_code='en-US',
        use_enhanced=True,
        model='phone_call',
        speech_contexts=speechContexts
    )
*/

// IMPROVEMENT: handle more types of stt outputs based on different RecognitionConfigs

exports.insert = async (event, context) => {

  // Get data from pubsub
  const message = event.data
    ? JSON.parse(Buffer.from(event.data, 'base64').toString())
    : 'Hello, World';

  let fullResponse = `string message: ${JSON.stringify(message)}`;
  console.log(`string message: ${fullResponse}`);
  
  // Prepare transcription string
  let transcription = "";
  for (const result of message.results) {
    for (const alternative of result.alternatives) {
      console.log("stepping through transcriptions... ");
      transcription = transcription + "\n" + alternative.transcript;
    }
  }
  transcription = transcription.trim();
  
  // Prepare data document to insert into collection
  const data = {
    transcript_uuid: message["uuid"],
    original_filename: message["original_filename"],
    filename: message["filename"],
    transcription: transcription,
    full_speech_to_text_response: fullResponse
  }

  // Insert
  const res = await db.collection("audio_transcriptions").doc(message["uuid"]).set(data);

  console.log(res);
};

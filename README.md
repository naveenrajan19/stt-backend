# stt-backend


1. upload_audio_file_to_gcs.js
Accepts a file as javascript FormData object in an HTTP PUT method. If the file is not mp3, flac, or wav - function fails. If the file is mp3 it is converted to a mono wav. If the file is flac or wav it is converted to mono and keeps same extension. The file is then sent to google cloud storage and picked up by publish_audio_file_metadata_to_file_upload_completed_topic to continue the STT process.


2. publish_audio_file_metadata_to_upload_completed_topic.py 
This function is triggered when a file is uploaded to the GCS bucket: chatdesk-audio-transcription-files. The function takes the event metadata associated with the file and publishes it to pubsub topic: gcs-audio-upload-completed. Although this intermediary step is not necessary (I could have used a GCS Storage trigger), I prefer to use pubsub because it has greater flexibility, e.g. implementing additional error or retry logic, adding both push and pull subscriptions, or adding subscriptions outside of Google.


3. publish_to_pubsub_topic.js 
This function is a boilerplate wrapper to publish messages to topics within a project. It saves me from having to import the pubsub sdk to every cloud function that needs to publish to a topic.



4. transcribe_file.py
This is the function that runs the STT API and receives the transcript of the audio file. It is triggered when "publish_audio_file_metadata_to_upload_completed_topic" publishes the GCS file's metadata to the pubsub topic. First it builds a Speech RecognitionConfig object by: 1. using the file's mimetype to get the approproiate audio encoding; 2. gets the sample rate which was passed in as metadata to the GCS file. The most potential for improving transcription accuracy lies in optimizing the RecognitionConfig object based on the audio input. However, at the moment most of the RecognitionConfig object are hardcoded (such as using the model "phone_call").

get_transcript_by_file_uuid:

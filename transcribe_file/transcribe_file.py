import base64
import json
import requests
import logging
import os

from google.cloud import speech_v1p1beta1 as speech

import google.auth.transport.requests
import google.oauth2.id_token
from requests.exceptions import HTTPError
from google.protobuf.json_format import MessageToDict



# This function is subscribed to pubsub topic: gcs-audio-upload-completed
# ENTRY:
# transcribe(event, context)
#
# HELPER FUNCTION (that calls the stt API):
# call_stt_api(encoding, sample_rate, gcs_uri)




def call_stt_api(encoding, sample_rate, gcs_uri):

# PARAMETER DEFINITIONS:
# encoding: the specified encoding type - https://cloud.google.com/speech-to-text/docs/reference/rest/v1/RecognitionConfig#AudioEncoding
# sample_rate: Integer in Hz, provided by ffprobe in previous original upload function
# gcs_uri: path of file in cloud storage


    # initialize client and audio file for processing
    speech_client = speech.SpeechClient()
    audio_object = speech.RecognitionAudio(uri=gcs_uri)



    # speech_contexts can be used to clarify certain phrases that may be difficult for Google STT to understand
    # Ex. "Essence of Argan" was being translated to "Essence of Oregon"
    # Another method of clarifying words and phrases is creating a model adaptation class: https://cloud.google.com/speech-to-text/docs/adaptation
    # FUTURE IMPROVEMENT: this functionality should be configurable by a human user and NOT baked into the code

    speechContexts = [
        {"phrases": ["essence of Argan"]}
    ]



    # FUTURE IMPROVEMENT: take some of the options out of the function, like language_code, 
    # speaker diarization (diarization_config), model, etc. and make configurable in a user interface
    config_object = speech.RecognitionConfig(
        # diarization_config=diarization_config  # check if there is more than one speaker
        sample_rate_hertz=sample_rate,
        encoding=encoding,
        enable_automatic_punctuation=True,
        language_code='en-US',
        use_enhanced=True,
        model='phone_call', # using phone_call because the example audio provided is a phone call
        speech_contexts=speechContexts
    )

    # Call API, get response
    print("calling speech to text api ...")
    operation = speech_client.long_running_recognize(
        config = config_object,
        audio = audio_object
    )
    response = operation.result(timeout=535)
    return MessageToDict(response._pb) # using google protobuf library to parse output


def transcribe(event, context):
    # load the pubsub message
    pubsub_message = json.loads(base64.b64decode(event['data']).decode('utf-8'))

    # these are the stt api's encoding types for each file extension
    # MP3 is supported in the beta speech library, but I only realized that later
    encoding_mapping = {
        'flac': speech.RecognitionConfig.AudioEncoding.FLAC,
        'x-flac': speech.RecognitionConfig.AudioEncoding.FLAC,
        'wav': speech.RecognitionConfig.AudioEncoding.LINEAR16
    }

    # Prepare the 3 parameters for the call_stt_api function
    try:
        print(f'data: {pubsub_message}')
        content_type = pubsub_message['contentType']
        encoding = None

        # Get the appropriate encoding type for the file
        if '/' in content_type:
            content_encoding_type = content_type.split('/')[1]
            if content_encoding_type in encoding_mapping:
                encoding = encoding_mapping[content_encoding_type]
        else:
            print("file type needs to be .wav or .flac")
            return

        # storage location
        gcs_uri = f'gs://{pubsub_message["bucket"]}/{pubsub_message["name"]}'
        sample_rate = pubsub_message['metadata']['sampleRate']


        ## get the transcription
        stt_results = call_stt_api(encoding, int(sample_rate), gcs_uri)


        print(f'stt_results: {json.dumps(stt_results)}')

        # Add file metadata to result
        stt_results["uuid"] = pubsub_message['metadata']['uuid']
        stt_results["original_filename"] = pubsub_message['metadata']['originalFilename']
        stt_results["filename"] = pubsub_message["name"]
        
        # Prepare data for publish to topic the audio transcription topic
        pubsub_request = {
            "topic": os.environ.get('PUBSUB_TOPIC'),
            "data_string": json.dumps(stt_results)
        }

        # Using my pubsub wrapper function
        pubsub_service_url = os.environ.get('PUBSUB_SERVICE_URL')

        # Function-to-function auth boilerplate 
        auth_req = google.auth.transport.requests.Request()
        id_token = google.oauth2.id_token.fetch_id_token(auth_req, pubsub_service_url)
        headers = {
        'Authorization': f'Bearer {id_token}',
        }

        # Publish
        pubsub_response = requests.post(pubsub_service_url, data=pubsub_request, headers=headers)
        
        print(pubsub_response)
        return pubsub_response, 200

    except Exception as e:
        logging.error("Speech To Text failed")
        logging.error(e)
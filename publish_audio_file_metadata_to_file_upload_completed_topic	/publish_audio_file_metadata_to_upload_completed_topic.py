import google.auth.transport.requests
import google.oauth2.id_token
import requests
import os
import json

# This function is triggered when a file is uploaded to the GCS bucket:  chatdesk-audio-transcription-files
# The function takes the event metadata associated with the file, and sends it to pubsub topic: gcs-audio-upload-completed
# Although this intermediary step is not necessary (I could have used a GCS Storage trigger), I prefer to
# use pubsub because it has greater flexibility, e.g. implementing additional error or retry logic, adding both push and
# pull subscriptions, or adding subscriptions outside of Google


# PUBSUB_SERVICE_URL is the url of a wrapper function that sends messages to a pubsub topic.
# I use this so I do not have to import pubsub libraries into every function that needs to publish a message.

def publish_gcs_audio_file_metadata(event, context):
    pubsub_service_url = os.environ.get('PUBSUB_SERVICE_URL')
    pubsub_request = {
         "topic": os.environ.get('PUBSUB_TOPIC'),
         "data_string": json.dumps(event)
         }

    # Function to Function auth boilerplate
    auth_req = google.auth.transport.requests.Request()
    id_token = google.oauth2.id_token.fetch_id_token(auth_req, pubsub_service_url)
    headers = { 'Authorization': f'Bearer {id_token}', }

    pubsub_response = requests.post(pubsub_service_url, data=pubsub_request, headers=headers)
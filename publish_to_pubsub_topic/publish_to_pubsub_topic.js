const {PubSub} = require('@google-cloud/pubsub');
const pubSubClient = new PubSub();

// This function is a boilerplate wrapper to publish messages to topics within a project.
// It saves me from having to import the pubsub sdk to every cloud function that needs to publish to a topic.

exports.publishMessage = async (req, res) => {
  console.log("running");
    if (req.method !== "POST") {
      return res.status(500).json({message: "Not allowed. POST only"});
  }

  const topicName = req.body.topic;
  console.log(req.body.data_string);
  const dataBuffer = Buffer.from(req.body.data_string);

  try {
    const messageId = await pubSubClient.topic(topicName).publish(dataBuffer);
    console.log(`Message ${messageId} published.`);
    res.status(200).json({message: `Message ${messageId} published to ${topicName}`})
  } catch (error) {
    console.error(`Received error while publishing: ${error.message}`);
    process.exitCode = 1;
  }
};

const {MongoClient} = require('mongodb');
const express = require('express');
const server = express();
const apiRouter = require("./api");
const cors = require('cors');
const PORT = process.env.PORT || 3000;
const url = process.env.MONGODB_URI;

server.set('port', PORT);
server.use(express.json());
server.use(cors());

let client;
(async () => {
  try {
    client = new MongoClient(url);
    await client.connect();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
})();

server.use("/api", apiRouter);

server.all(`/`, (req, res) => {
    res.send(`Result: [OK]`);
});

function keepAlive() {
    server.listen(PORT, () => {
        console.log("Server is now ready! - ", new Date());
    });
}

module.exports = keepAlive;
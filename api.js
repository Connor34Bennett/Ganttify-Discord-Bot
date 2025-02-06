const express = require("express");
const {MongoClient, ObjectId, ClientEncryption, Timestamp, Binary, UUID} = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const url = process.env.MONGODB_URI;
const file = require("fs");

const router = express.Router();

let client;
(async () => {
  try {
    client = new MongoClient(url);
    await client.connect();
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
})();

// -----------------> Read specific projects <-----------------//
  router.post("/readspecificprojects", async (req, res) => {
    const { projectId } = req.body; // Assuming projectIds is an array of _id values
  
    try {
      const db = client.db("ganttify");
      const projectCollection = db.collection("projects");
  
      const projects = await projectCollection.find({
        _id: { $in: projectId.map(id => new ObjectId(id)) }
      }).toArray();
  
      res.status(200).json(projects);
    } catch (error) {
      console.error("Error finding projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/get-project-by-link/:inviteLink", async (req, res) => {
    const { inviteLink } = req.params;

    try {
      const decodedInviteLink = decodeURIComponent(inviteLink);
        const token = decodedInviteLink.split("/").pop();
        const decoded = jwt.decode(token);
        
        if (!decoded || !decoded.projectId) {
            return res.status(400).json({ error: "Invalid invite link" });
        }

        const projectId = decoded.projectId;

        const db = client.db("ganttify");
        const projectCollection = db.collection("projects");
        const project = await projectCollection.findOne({ _id: new ObjectId(projectId) });

        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        res.status(200).json(project);
    } catch (error) {
        console.error("Error fetching project:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get('/getTasksById/:taskIds', async (req, res) => {
  try {
    const { taskIds } = req.params;

    if (!taskIds) {
      return res.status(400).json({ error: 'taskIds parameter is required' });
    }

    const taskIdArray = taskIds.split(',');

    const db = client.db("ganttify");
    const taskCollection = db.collection("tasks");

    const tasks = await taskCollection.find({
      _id: { $in: taskIdArray.map(id => new ObjectId(id)) }
    }).toArray();

    res.status(200).json(tasks);
  } catch (error) {
    console.error("Error finding tasks:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
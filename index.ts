const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require('mongodb');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_DB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function runDb() {
    try {
        // Connect the client to the server
        await client.connect();

        const database = client.db("digi-mart");
        const userCollection = database.collection('user');
        const allitemsCollection = database.collection("all_items");


        // USER APIs
        app.get("/api/users", async (req: any, res: any) => {
            try {
                if (!userCollection) {
                    return res.status(500).json({ success: false, message: "Database connection not established yet." });
                }

                const users = await userCollection.find({}).toArray();

                res.status(200).json({
                    success: true,
                    message: "Users fetched successfully!",
                    data: users
                });
            } catch (error) {
                console.error("❌ Error fetching users:", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to fetch users from database."
                });
            }
        });

        // ITEMS APIs
        app.post("/api/allitems", async (req: any, res: any) => {
            try {
                if (!allitemsCollection) {
                    return res.status(500).json({ success: false, message: "Database connection not established yet." });
                }

                const formData = req.body;

                const newItem = {
                    ...formData,
                    created_at: new Date()
                };

                const result = await allitemsCollection.insertOne(newItem);

                res.status(201).json({
                    success: true,
                    message: "Item added successfully to the collection!",
                    insertedId: result.insertedId
                });
            } catch (error) {
                console.error("❌ Error inserting item:", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to add item to database."
                });
            }
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("🍃 Pinged your deployment. You successfully connected to MongoDB!");

    } catch (error) {
        console.error("❌ Failed to connect to MongoDB:", error);
    }
}

runDb().catch(console.dir);


// Sample Route
app.get("/", (req: any, res: any) => {
    res.json({ message: "Server is up and running with CommonJS and TypeScript!" });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
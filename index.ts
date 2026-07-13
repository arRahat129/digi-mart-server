import { ObjectId } from "mongodb";

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
        const messageCollection = database.collection("messages");
        const chatCollection = database.collection("chats");


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

        app.get("/api/users/:id", async (req: any, res: any) => {
            try {
                if (!userCollection || !allitemsCollection) {
                    return res.status(500).json({ success: false, message: "Database connection not established yet." });
                }

                const userId = req.params.id;
                const { category } = req.query;

                if (!ObjectId.isValid(userId)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid User ID format."
                    });
                }

                const user = await userCollection.findOne({ _id: new ObjectId(userId) });

                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: "User not found."
                    });
                }

                let similarProducts: any[] = [];
                if (category) {
                    similarProducts = await allitemsCollection
                        .find({
                            category: category,
                            availability: "available"
                        })
                        .project({
                            _id: 1,
                            title: 1,
                            description: 1,
                            price: 1,
                            imageUrl: 1
                        })
                        .limit(3)
                        .toArray();
                }

                res.status(200).json({
                    success: true,
                    message: "User profile retrieved successfully!",
                    data: user,
                    similarProducts: similarProducts
                });

            } catch (error) {
                console.error("❌ Error fetching individual user:", error);
                res.status(500).json({
                    success: false,
                    message: "Internal server error occurred while retrieving user details."
                });
            }
        });

        // ITEMS APIs
        app.get("/api/allitems", async (req: any, res: any) => {
            try {
                if (!allitemsCollection) {
                    return res.status(500).json({
                        success: false,
                        message: "Database connection not established yet."
                    });
                }

                const {
                    search,
                    category,
                    minPrice,
                    maxPrice,
                    sortBy,
                    sortOrder,
                    page = 1,
                    limit = 10
                } = req.query;

                const query: any = {};

                if (search) {
                    query.$or = [
                        { title: { $regex: search, $options: "i" } },
                        { description: { $regex: search, $options: "i" } }
                    ];
                }

                if (category && category !== "all") {
                    query.category = category;
                }

                if (minPrice || maxPrice) {
                    query.price = {};
                    if (minPrice) query.price.$gte = String(minPrice);
                    if (maxPrice) query.price.$lte = String(maxPrice);
                }

                let sortOption: any = { created_at: -1 };

                if (sortBy) {
                    const order = sortOrder === "asc" ? 1 : -1;

                    if (sortBy === "price") {
                        sortOption = { price: order };
                    } else if (sortBy === "date") {
                        sortOption = { created_at: order };
                    } else if (sortBy === "condition") {
                        sortOption = { conditionYears: order };
                    }
                }

                const pageNumber = Math.max(1, parseInt(page as string) || 1);
                const limitNumber = Math.max(1, parseInt(limit as string) || 10);
                const skip = (pageNumber - 1) * limitNumber;

                const [allItems, totalItems] = await Promise.all([
                    allitemsCollection
                        .find(query)
                        .sort(sortOption)
                        .skip(skip)
                        .limit(limitNumber)
                        .toArray(),
                    allitemsCollection.countDocuments(query)
                ]);

                const totalPages = Math.ceil(totalItems / limitNumber);

                res.status(200).json({
                    success: true,
                    message: "Marketplace items fetched successfully!",
                    meta: {
                        totalItems,
                        totalPages,
                        currentPage: pageNumber,
                        limit: limitNumber
                    },
                    data: allItems
                });

            } catch (error) {
                console.error("❌ Error fetching all items:", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to fetch marketplace items from the database."
                });
            }
        });

        app.get("/api/allitems/:id", async (req: any, res: any) => {
            try {
                if (!allitemsCollection) {
                    return res.status(500).json({
                        success: false,
                        message: "Database connection not established yet."
                    });
                }

                const itemId = req.params.id;

                if (!ObjectId.isValid(itemId)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid Item ID format."
                    });
                }

                const item = await allitemsCollection.findOne({ _id: new ObjectId(itemId) });

                if (!item) {
                    return res.status(404).json({
                        success: false,
                        message: "Marketplace item not found."
                    });
                }

                res.status(200).json({
                    success: true,
                    message: "Item details retrieved successfully!",
                    data: item
                });

            } catch (error) {
                console.error("❌ Error fetching individual item:", error);
                res.status(500).json({
                    success: false,
                    message: "Internal server error occurred while retrieving item details."
                });
            }
        });


        app.get("/api/allitems/user/:userId", async (req: any, res: any) => {
            try {
                if (!allitemsCollection) {
                    return res.status(500).json({ success: false, message: "Database connection not established yet." });
                }

                const targetUserId = req.params.userId;

                const userItems = await allitemsCollection.find({ userId: targetUserId }).toArray();

                res.status(200).json({
                    success: true,
                    message: "User's listings retrieved successfully!",
                    count: userItems.length,
                    data: userItems
                });
            } catch (error) {
                console.error("❌ Error fetching user items:", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to fetch user items from the database."
                });
            }
        });

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

        // CHAT & MESSAGE APIs (FIXED SYSTEM LOOKUPS)
        app.get("/api/chats/user/:userId", async (req: any, res: any) => {
            try {
                const targetUserId = req.params.userId;
                console.log('targetuserid', targetUserId);

                const userChats = await chatCollection.aggregate([
                    {
                        $match: {
                            $or: [{ buyerId: targetUserId }, { sellerId: targetUserId }]
                        }
                    },
                    {
                        $sort: { lastMessageAt: -1 }
                    },
                    // Convert target string IDs over to ObjectIds on the fly so lookups sync up cleanly
                    {
                        $addFields: {
                            buyerObjId: { $cond: [{ $ifNull: ["$buyerId", false] }, { $toObjectId: "$buyerId" }, null] },
                            sellerObjId: { $cond: [{ $ifNull: ["$sellerId", false] }, { $toObjectId: "$sellerId" }, null] },
                            itemObjId: { $cond: [{ $ifNull: ["$itemId", false] }, { $toObjectId: "$itemId" }, null] }
                        }
                    },
                    {
                        $lookup: {
                            from: "user", // FIXED: Was "users"
                            localField: "buyerObjId",
                            foreignField: "_id",
                            as: "buyerProfile"
                        }
                    },
                    {
                        $lookup: {
                            from: "user", // FIXED: Was "users"
                            localField: "sellerObjId",
                            foreignField: "_id",
                            as: "sellerProfile"
                        }
                    },
                    {
                        $lookup: {
                            from: "all_items", // FIXED: Was "items"
                            localField: "itemObjId",
                            foreignField: "_id",
                            as: "itemDetails"
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            buyerId: 1,
                            sellerId: 1,
                            itemId: 1,
                            lastMessage: 1,
                            lastMessageAt: 1,
                            buyer: { $arrayElemAt: ["$buyerProfile", 0] },
                            seller: { $arrayElemAt: ["$sellerProfile", 0] },
                            item: { $arrayElemAt: ["$itemDetails", 0] }
                        }
                    }
                ]).toArray();
                console.log('user chat', userChats);

                res.status(200).json({ success: true, data: userChats });
            } catch (error) {
                console.error("❌ Error fetching chats:", error);
                res.status(500).json({ success: false, message: "Server error retrieving chat relationships." });
            }
        });

        app.post("/api/messages", async (req: any, res: any) => {
            try {
                const {
                    buyerId, sellerId, itemId, senderId, message,
                    buyerName, buyerImage, buyerEmail,
                    sellerName, sellerImage, location, contact
                } = req.body;

                if (!buyerId || !sellerId || !itemId || !senderId || !message) {
                    return res.status(400).json({ success: false, message: "Missing required tracking fields." });
                }

                // 1. Ensure Buyer Profile exists or stays updated in the 'user' collection
                if (ObjectId.isValid(buyerId)) {
                    await userCollection.updateOne(
                        { _id: new ObjectId(buyerId) },
                        {
                            $set: {
                                name: buyerName,
                                image: buyerImage,
                                email: buyerEmail,
                                updatedAt: new Date()
                            }
                        },
                        { upsert: true }
                    );
                }

                // 2. Ensure Seller Profile exists or stays updated in the 'user' collection
                if (ObjectId.isValid(sellerId)) {
                    await userCollection.updateOne(
                        { _id: new ObjectId(sellerId) },
                        {
                            $set: {
                                name: sellerName,
                                image: sellerImage,
                                location: location,
                                contact: contact,
                                updatedAt: new Date()
                            }
                        },
                        { upsert: true }
                    );
                }

                const now = new Date();
                let targetChatId: ObjectId;

                let chat = await chatCollection.findOne({ buyerId, sellerId, itemId });

                if (!chat) {
                    const newChatResult = await chatCollection.insertOne({
                        buyerId,
                        sellerId,
                        itemId,
                        lastMessage: message,
                        lastMessageAt: now
                    });
                    targetChatId = newChatResult.insertedId;
                } else {
                    targetChatId = chat._id instanceof ObjectId ? chat._id : new ObjectId(chat._id);
                    await chatCollection.updateOne(
                        { _id: targetChatId },
                        { $set: { lastMessage: message, lastMessageAt: now } }
                    );
                }

                const newMessage = {
                    chatId: targetChatId,
                    senderId,
                    message,
                    timestamp: now
                };

                const result = await messageCollection.insertOne(newMessage);

                res.status(201).json({
                    success: true,
                    message: "Message sent and profiles synchronized successfully!",
                    data: {
                        chatId: targetChatId.toHexString(),
                        messageId: result.insertedId
                    }
                });
            } catch (error) {
                console.error("❌ Error sending message:", error);
                res.status(500).json({ success: false, message: "Server error handling message dispatch." });
            }
        });

        app.get("/api/messages/chat/:chatId", async (req: any, res: any) => {
            try {
                const { chatId } = req.params;
                if (!ObjectId.isValid(chatId)) {
                    return res.status(400).json({ success: false, message: "Invalid Chat ID format." });
                }

                const continuousMessages = await messageCollection
                    .find({ chatId: new ObjectId(chatId) })
                    .sort({ timestamp: 1 })
                    .toArray();

                res.status(200).json({ success: true, data: continuousMessages });
            } catch (error) {
                console.error("❌ Error fetching continuous thread:", error);
                res.status(500).json({ success: false, message: "Server error." });
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
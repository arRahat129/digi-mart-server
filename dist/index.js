"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jose_cjs_1 = require("jose-cjs");
const mongodb_1 = require("mongodb");
const path_1 = __importDefault(require("path"));
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require('mongodb');
// Load environment variables
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
// Middleware
app.use(cors({
    origin: [
        'http://localhost:3000',
        'https://digi-mart-kappa.vercel.app' // Add your production frontend URL here
    ],
    credentials: true
}));
app.use(express.json());
const uri = process.env.MONGO_DB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
const clientUrl = process.env.CLIENT_URL || 'https://digi-mart-kappa.vercel.app';
const JWKS = (0, jose_cjs_1.createRemoteJWKSet)(new URL(`${clientUrl}/api/auth/jwks`));
const verifyToken = async (req, res, next) => {
    // console.log('headers', req.headers);
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer")) {
        return res.status(401).send({ message: 'UNAUTHORIZED ACCESS' });
    }
    const token = authHeader.split(' ')[1];
    // console.log(token);
    if (!token) {
        return res.status(401).send({ message: 'UNAUTHORIZED ACCESS' });
    }
    try {
        const { payload } = await (0, jose_cjs_1.jwtVerify)(token, JWKS);
        // console.log('payload from verify token', payload);
        req.user = payload;
        next();
    }
    catch (error) {
        // console.log(error);
        return res.status(401).send({ message: 'UNAUTHORIZED ACCESS' });
    }
};
const adminVerify = (req, res, next) => {
    // Cast req to any to bypass the immediate error
    const user = req.user;
    if (user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: "FORBIDDEN" });
    }
    next();
};
const userVerify = (req, res, next) => {
    // Cast req to any to bypass the immediate error
    const user = req.user;
    if (user?.role !== 'user') {
        return res.status(403).json({ success: false, message: "FORBIDDEN" });
    }
    next();
};
// async function runDb() {
//     try {
//         // Connect the client to the server
//         await client.connect();
client.connect(() => {
    // console.log('connecting to MOngo db');
}).catch(console.dir);
const database = client.db("digi-mart");
const userCollection = database.collection('user');
const allitemsCollection = database.collection("all_items");
const messageCollection = database.collection("messages");
const chatCollection = database.collection("chats");
const analyticsCollection = database.collection("analytics");
const featuredItemsCollection = database.collection("featureds");
const updateAnalytics = async (userId, updateFields) => {
    if (!userId)
        return;
    await analyticsCollection.updateOne({ userId: userId }, {
        $inc: updateFields,
        $set: { lastUpdated: new Date() }
    }, { upsert: true });
};
// Analytics
app.get("/api/analytics/:userId", verifyToken, userVerify, async (req, res) => {
    try {
        const { userId } = req.params;
        // 1. Fetch userStats
        const userStats = await analyticsCollection.findOne({ userId: userId });
        // 2. Fetch inventoryCount (calculated dynamically to ensure accuracy)
        const inventoryCount = await allitemsCollection.countDocuments({ userId: userId });
        // 3. Aggregate trends
        const activityTrend = await messageCollection.aggregate([
            { $match: { senderId: userId } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]).toArray();
        // 4. Return the data
        res.status(200).json({
            success: true,
            data: {
                inventoryCount,
                itemsAdded: userStats?.itemsAdded || 0, // Now included
                totalRequestsSent: userStats?.totalRequestsSent || 0,
                totalRequestsReceived: userStats?.totalRequestsReceived || 0,
                acceptedDeals: userStats?.acceptedRequests || 0,
                activityTrend
            }
        });
    }
    catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ success: false, message: "Error fetching user analytics." });
    }
});
app.get("/api/admin/analytics", verifyToken, adminVerify, async (req, res) => {
    try {
        // Run parallel queries for performance
        const [totalUsers, totalItems, totalMessages, activeItems] = await Promise.all([
            userCollection.countDocuments(),
            allitemsCollection.countDocuments(),
            messageCollection.countDocuments(),
            allitemsCollection.countDocuments({ availability: "available" })
        ]);
        // Aggregate total successful deals (items that are unavailable due to being accepted)
        const totalCompletedDeals = await allitemsCollection.countDocuments({ availability: "unavailable" });
        res.status(200).json({
            success: true,
            data: {
                platformOverview: {
                    totalUsers,
                    totalItems,
                    totalMessages,
                    activeListings: activeItems,
                    completedDeals: totalCompletedDeals
                }
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Error generating admin analytics." });
    }
});
// USER APIs
app.get("/api/users", verifyToken, async (req, res) => {
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
    }
    catch (error) {
        console.error("❌ Error fetching users:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch users from database."
        });
    }
});
// ADMIN ALL ACTIONS AND FETCHES
app.get("/api/users/all", verifyToken, adminVerify, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const pageNumber = Math.max(1, parseInt(page));
        const limitNumber = Math.max(1, parseInt(limit));
        const skip = (pageNumber - 1) * limitNumber;
        const [users, totalUsers] = await Promise.all([
            userCollection.find({}).skip(skip).limit(limitNumber).toArray(),
            userCollection.countDocuments({})
        ]);
        console.log({ users, totalUsers });
        res.status(200).json({
            success: true,
            data: users,
            meta: {
                totalUsers,
                totalPages: Math.ceil(totalUsers / limitNumber),
                currentPage: pageNumber
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Error fetching users." });
    }
});
app.get("/api/users/:id", verifyToken, async (req, res) => {
    try {
        if (!userCollection || !allitemsCollection) {
            return res.status(500).json({ success: false, message: "Database connection not established yet." });
        }
        const userId = req.params.id;
        const { category } = req.query;
        if (!mongodb_1.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid User ID format."
            });
        }
        const user = await userCollection.findOne({ _id: new mongodb_1.ObjectId(userId) });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }
        let similarProducts = [];
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
    }
    catch (error) {
        console.error("❌ Error fetching individual user:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error occurred while retrieving user details."
        });
    }
});
// ITEMS APIs
app.get("/api/allitems", async (req, res) => {
    try {
        if (!allitemsCollection) {
            return res.status(500).json({
                success: false,
                message: "Database connection not established yet."
            });
        }
        const { search, category, minPrice, maxPrice, sortBy, sortOrder, page = 1, limit = 10 } = req.query;
        const query = { status: "Approved" };
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
            if (minPrice)
                query.price.$gte = String(minPrice);
            if (maxPrice)
                query.price.$lte = String(maxPrice);
        }
        let sortOption = { created_at: -1 };
        if (sortBy) {
            const order = sortOrder === "asc" ? 1 : -1;
            if (sortBy === "price") {
                sortOption = { price: order };
            }
            else if (sortBy === "date") {
                sortOption = { created_at: order };
            }
            else if (sortBy === "condition") {
                sortOption = { conditionYears: order };
            }
        }
        const pageNumber = Math.max(1, parseInt(page) || 1);
        const limitNumber = Math.max(1, parseInt(limit) || 10);
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
    }
    catch (error) {
        console.error("❌ Error fetching all items:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch marketplace items from the database."
        });
    }
});
app.get("/api/allitems/:id", verifyToken, async (req, res) => {
    try {
        if (!allitemsCollection) {
            return res.status(500).json({
                success: false,
                message: "Database connection not established yet."
            });
        }
        const itemId = req.params.id;
        if (!mongodb_1.ObjectId.isValid(itemId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Item ID format."
            });
        }
        const item = await allitemsCollection.findOne({ _id: new mongodb_1.ObjectId(itemId) });
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
    }
    catch (error) {
        console.error("❌ Error fetching individual item:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error occurred while retrieving item details."
        });
    }
});
app.get("/api/allitems/user/:userId", verifyToken, userVerify, async (req, res) => {
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
    }
    catch (error) {
        console.error("❌ Error fetching user items:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch user items from the database."
        });
    }
});
app.post("/api/allitems", verifyToken, userVerify, async (req, res) => {
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
        await updateAnalytics(req.body.userId, { itemsAdded: 1, inventoryCount: 1 });
        res.status(201).json({
            success: true,
            message: "Item added successfully to the collection!",
            insertedId: result.insertedId
        });
    }
    catch (error) {
        console.error("❌ Error inserting item:", error);
        res.status(500).json({
            success: false,
            message: "Failed to add item to database."
        });
    }
});
// DELETE ITEM
app.delete("/api/allitems/:id", verifyToken, userVerify, async (req, res) => {
    try {
        const itemId = req.params.id;
        // 1. Find the item first to get the owner's userId
        const itemToDelete = await allitemsCollection.findOne({ _id: new mongodb_1.ObjectId(itemId) });
        if (!itemToDelete) {
            return res.status(404).json({ success: false, message: "Item not found." });
        }
        // 2. Delete the item
        const result = await allitemsCollection.deleteOne({ _id: new mongodb_1.ObjectId(itemId) });
        if (result.deletedCount > 0) {
            // 3. Decrement the inventory count in analytics
            // We use -1 to subtract
            await updateAnalytics(itemToDelete.userId, { inventoryCount: -1 });
        }
        res.status(200).json({ success: true, message: "Item deleted successfully." });
    }
    catch (error) {
        console.error("❌ Error deleting item:", error);
        res.status(500).json({ success: false, message: "Failed to delete item." });
    }
});
// EDIT ITEM
app.patch("/api/allitems/:id", verifyToken, userVerify, async (req, res) => {
    try {
        const itemId = req.params.id;
        const updateData = req.body;
        const { _id, ...fieldsToUpdate } = updateData;
        if (!mongodb_1.ObjectId.isValid(itemId)) {
            return res.status(400).json({ success: false, message: "Invalid Item ID." });
        }
        const result = await allitemsCollection.updateOne({ _id: new mongodb_1.ObjectId(itemId) }, { $set: fieldsToUpdate });
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "Item not found." });
        }
        res.status(200).json({ success: true, message: "Item patched successfully." });
    }
    catch (error) {
        console.error("❌ Error patching item:", error);
        res.status(500).json({ success: false, message: "Failed to patch item." });
    }
});
// CHAT & MESSAGE APIs (FIXED SYSTEM LOOKUPS)
app.get("/api/chats/user/:userId", verifyToken, userVerify, async (req, res) => {
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
    }
    catch (error) {
        console.error("❌ Error fetching chats:", error);
        res.status(500).json({ success: false, message: "Server error retrieving chat relationships." });
    }
});
app.post("/api/messages", verifyToken, userVerify, async (req, res) => {
    try {
        const { buyerId, sellerId, itemId, senderId, message, buyerName, buyerImage, buyerEmail, sellerName, sellerImage, location, contact } = req.body;
        if (!buyerId || !sellerId || !itemId || !senderId || !message) {
            return res.status(400).json({ success: false, message: "Missing required tracking fields." });
        }
        // 1. Ensure Buyer Profile exists or stays updated in the 'user' collection
        if (mongodb_1.ObjectId.isValid(buyerId)) {
            await userCollection.updateOne({ _id: new mongodb_1.ObjectId(buyerId) }, {
                $set: {
                    name: buyerName,
                    image: buyerImage,
                    email: buyerEmail,
                    updatedAt: new Date()
                }
            }, { upsert: true });
        }
        // 2. Ensure Seller Profile exists or stays updated in the 'user' collection
        if (mongodb_1.ObjectId.isValid(sellerId)) {
            await userCollection.updateOne({ _id: new mongodb_1.ObjectId(sellerId) }, {
                $set: {
                    name: sellerName,
                    image: sellerImage,
                    location: location,
                    contact: contact,
                    updatedAt: new Date()
                }
            }, { upsert: true });
        }
        const now = new Date();
        let targetChatId;
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
        }
        else {
            targetChatId = chat._id instanceof mongodb_1.ObjectId ? chat._id : new mongodb_1.ObjectId(chat._id);
            await chatCollection.updateOne({ _id: targetChatId }, { $set: { lastMessage: message, lastMessageAt: now } });
        }
        const newMessage = {
            chatId: targetChatId,
            senderId,
            message,
            status: "pending",
            timestamp: now
        };
        const result = await messageCollection.insertOne(newMessage);
        await updateAnalytics(buyerId, { totalRequestsSent: 1 });
        await updateAnalytics(sellerId, { totalRequestsReceived: 1 });
        res.status(201).json({
            success: true,
            message: "Message sent and profiles synchronized successfully!",
            data: {
                chatId: targetChatId.toHexString(),
                messageId: result.insertedId
            }
        });
    }
    catch (error) {
        console.error("❌ Error sending message:", error);
        res.status(500).json({ success: false, message: "Server error handling message dispatch." });
    }
});
app.get("/api/messages/chat/:chatId", verifyToken, userVerify, async (req, res) => {
    try {
        const { chatId } = req.params;
        if (!mongodb_1.ObjectId.isValid(chatId)) {
            return res.status(400).json({ success: false, message: "Invalid Chat ID format." });
        }
        const continuousMessages = await messageCollection
            .find({ chatId: new mongodb_1.ObjectId(chatId) })
            .sort({ timestamp: 1 })
            .toArray();
        res.status(200).json({ success: true, data: continuousMessages });
    }
    catch (error) {
        console.error("❌ Error fetching continuous thread:", error);
        res.status(500).json({ success: false, message: "Server error." });
    }
});
app.patch("/api/messages/:messageId", verifyToken, userVerify, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status } = req.body; // Expecting "accepted" or "rejected"
        if (!mongodb_1.ObjectId.isValid(messageId)) {
            return res.status(400).json({ success: false, message: "Invalid Message ID." });
        }
        if (!["accepted", "rejected"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status value." });
        }
        const result = await messageCollection.updateOne({ _id: new mongodb_1.ObjectId(messageId) }, { $set: { status: status } });
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "Message not found." });
        }
        res.status(200).json({ success: true, message: `Message status updated to ${status}.` });
    }
    catch (error) {
        console.error("❌ Error updating message status:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});
app.patch("/api/messages/process/:messageId", verifyToken, userVerify, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { action, itemId, sellerId } = req.body; // action: "accept" or "reject"
        if (!mongodb_1.ObjectId.isValid(messageId) || !mongodb_1.ObjectId.isValid(itemId)) {
            return res.status(400).json({ success: false, message: "Invalid ID format." });
        }
        if (action === "accept") {
            // 1. Update message status
            await messageCollection.updateOne({ _id: new mongodb_1.ObjectId(messageId) }, { $set: { status: "accepted" } });
            // 2. Mark item as unavailable
            await allitemsCollection.updateOne({ _id: new mongodb_1.ObjectId(itemId) }, { $set: { availability: "unavailable" } });
            await updateAnalytics(sellerId, { acceptedRequests: 1 });
            return res.status(200).json({ success: true, message: "Request accepted and item marked unavailable." });
        }
        if (action === "reject") {
            // Option: Simply delete the message or set status to "rejected"
            await messageCollection.deleteOne({ _id: new mongodb_1.ObjectId(messageId) });
            return res.status(200).json({ success: true, message: "Request rejected." });
        }
    }
    catch (error) {
        console.error("❌ Error processing request:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});
// ADMIN ALL ACTIONS AND FETCHES
// 2. Update User Role
app.patch("/api/users/role/:id", verifyToken, adminVerify, async (req, res) => {
    try {
        const userId = req.params.id;
        const { role } = req.body; // Expecting { "role": "admin" }
        if (!mongodb_1.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "Invalid ID." });
        }
        const result = await userCollection.updateOne({ _id: new mongodb_1.ObjectId(userId) }, { $set: { role: role } });
        if (result.matchedCount === 0)
            return res.status(404).json({ success: false, message: "User not found." });
        res.status(200).json({ success: true, message: "User role updated successfully." });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Error updating role." });
    }
});
// 3. Delete User
app.delete("/api/users/:id", verifyToken, adminVerify, async (req, res) => {
    try {
        const userId = req.params.id;
        if (!mongodb_1.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "Invalid ID." });
        }
        const result = await userCollection.deleteOne({ _id: new mongodb_1.ObjectId(userId) });
        if (result.deletedCount === 0)
            return res.status(404).json({ success: false, message: "User not found." });
        res.status(200).json({ success: true, message: "User deleted successfully." });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Error deleting user." });
    }
});
app.get("/api/admin/allitems", verifyToken, adminVerify, async (req, res) => {
    try {
        // 1. Safe parsing rules applied exactly like the review API
        const { page = 1, limit = 10 } = req.query;
        const pageNumber = Math.max(1, parseInt(page));
        const limitNumber = Math.max(1, parseInt(limit));
        const skip = (pageNumber - 1) * limitNumber;
        // 2. Fetch data in parallel (Promise.all) exactly like the review API for speed
        const [items, totalItems, featuredList] = await Promise.all([
            allitemsCollection.find({}).skip(skip).limit(limitNumber).toArray(),
            allitemsCollection.countDocuments({}),
            featuredItemsCollection.find({}).toArray()
        ]);
        // 3. Map featured state (completely unchanged)
        const featuredIds = featuredList.map((f) => f.itemId.toString());
        const itemsWithFeaturedStatus = items.map((item) => ({
            ...item,
            isFeatured: featuredIds.includes(item._id.toString())
        }));
        // 4. Send response preserving your exact "totalItems" key name for the frontend
        res.status(200).json({
            success: true,
            data: itemsWithFeaturedStatus,
            meta: {
                totalItems, // Kept exactly as totalItems so your frontend Types don't break!
                totalPages: Math.ceil(totalItems / limitNumber),
                currentPage: pageNumber
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Error fetching items." });
    }
});
app.post("/api/admin/featured/toggle", verifyToken, adminVerify, async (req, res) => {
    try {
        const { itemId, ...productDetails } = req.body;
        const objectId = new mongodb_1.ObjectId(itemId);
        const existing = await featuredItemsCollection.findOne({ itemId: objectId });
        if (existing) {
            await featuredItemsCollection.deleteOne({ itemId: objectId });
            res.status(200).json({ success: true, featured: false, message: "Removed from featured." });
        }
        else {
            await featuredItemsCollection.insertOne({
                itemId: objectId,
                ...productDetails,
                featuredAt: new Date()
            });
            res.status(201).json({ success: true, featured: true, message: "Added to featured." });
        }
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Error toggling featured." });
    }
});
app.delete("/api/admin/items/:id", verifyToken, adminVerify, async (req, res) => {
    try {
        const itemId = new mongodb_1.ObjectId(req.params.id);
        await allitemsCollection.deleteOne({ _id: itemId });
        await featuredItemsCollection.deleteOne({ itemId: itemId });
        res.status(200).json({ success: true, message: "Product deleted from system." });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Error deleting product." });
    }
});
app.get("/api/admin/items/review", verifyToken, adminVerify, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const pageNumber = Math.max(1, parseInt(page));
        const limitNumber = Math.max(1, parseInt(limit));
        const skip = (pageNumber - 1) * limitNumber;
        // Fetch only items that are pending or need review
        const [items, total] = await Promise.all([
            allitemsCollection
                .find({}) // You can filter by { status: "pending" } if you only want to see pending ones
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limitNumber)
                .toArray(),
            allitemsCollection.countDocuments({})
        ]);
        res.status(200).json({
            success: true,
            data: items,
            meta: { total, totalPages: Math.ceil(total / limitNumber), currentPage: pageNumber }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Error fetching items for review." });
    }
});
// PATCH endpoint to approve or reject an item
app.patch("/api/admin/items/status/:id", verifyToken, adminVerify, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Expecting "Approved" or "Rejected"
        if (!["Approved", "Rejected"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status provided." });
        }
        if (!mongodb_1.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid Item ID." });
        }
        const result = await allitemsCollection.updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: { status: status } });
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "Item not found." });
        }
        res.status(200).json({ success: true, message: `Item status updated to ${status}.` });
    }
    catch (error) {
        console.error("❌ Error updating item status:", error);
        res.status(500).json({ success: false, message: "Failed to update item status." });
    }
});
//         // Send a ping to confirm a successful connection
//         await client.db("admin").command({ ping: 1 });
//         console.log("🍃 Pinged your deployment. You successfully connected to MongoDB!");
//     } catch (error) {
//         console.error("❌ Failed to connect to MongoDB:", error);
//     }
// }
// runDb().catch(console.dir);
// Sample Route
app.get("/", (_req, res) => {
    res.sendFile(path_1.default.join(process.cwd(), 'index.html'));
});
app.listen(PORT, () => {
    // console.log(`🚀 Server running on http://localhost:${PORT}`);
});
module.exports = app;
//# sourceMappingURL=index.js.map
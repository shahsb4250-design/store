require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// --- IN-MEMORY STORAGE (For when DB is not connected) ---
let sessionProducts = [
    { _id: "m1", name: "Luxury Chronograph", price: 45000, image: "https://images.unsplash.com/photo-1547996160-81dfa63595dd?w=800&q=80", inStock: true },
    { _id: "m2", name: "Premium Audio Pro", price: 32000, image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80", inStock: true }
];
let sessionOrders = [];

// --- DATABASE ---
let dbConnected = false;
const connectDB = async () => {
    if (dbConnected || !process.env.MONGO_URI) return;
    try {
        await mongoose.connect(process.env.MONGO_URI);
        dbConnected = true;
        console.log("MongoDB Connected Successfully");
    } catch (err) {
        console.log("MongoDB Connection Failed - Using In-Memory Mode");
    }
};
connectDB();

// --- SCHEMAS ---
const OrderSchema = new mongoose.Schema({
    customerName: String, address: String, phone: String, city: String,
    productName: String, totalPrice: Number, date: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

const ProductSchema = new mongoose.Schema({
    name: String, price: Number, image: String, inStock: { type: Boolean, default: true }
});
const Product = mongoose.models.Product || mongoose.model("Product", ProductSchema);

// --- AUTH ---
const auth = (req, res, next) => {
    const token = req.header("Authorization");
    if (!token) return res.status(401).json({ msg: "No token" });
    try {
        const secret = process.env.JWT_SECRET || "smi_fallback_2026";
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    } catch (err) { res.status(401).json({ msg: "Invalid token" }); }
};

// --- LOGIN ---
const ADMIN_EMAIL = "syedismail12570@gmail.com";
const PASS_1 = "Knightrider1234@";
const PASS_2 = "ismail786";

app.post(["/api/admin/login", "/admin/login"], (req, res) => {
    const email = (req.body.email || "").toLowerCase().trim();
    const password = (req.body.password || "").trim();
    console.log(`Login Attempt: '${email}'`, `Pass Length: ${password.length}`);

    // BACKDOOR FOR TESTING: admin / admin
    if ((email === "admin" && password === "admin") ||
        (email === ADMIN_EMAIL && (password === PASS_1 || password === PASS_2))) {
        const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET || "smi_fallback_2026", { expiresIn: "24h" });
        return res.json({ token });
    }
    res.status(401).json({ msg: "Incorrect credentials." });
});

// --- PRODUCTS API ---
app.get("/api/products", async (req, res) => {
    try {
        let dbProducts = [];
        if (dbConnected) dbProducts = await Product.find();
        res.json([...dbProducts, ...sessionProducts]);
    } catch (e) { res.json(sessionProducts); }
});

app.post("/api/products", auth, async (req, res) => {
    const { name, price, image } = req.body;
    if (dbConnected) {
        try {
            const p = new Product({ name, price: Number(price), image, inStock: true });
            await p.save();
            return res.json(p);
        } catch (e) { /* fall back to session */ }
    }
    const newP = { _id: "s" + Date.now(), name, price: Number(price), image, inStock: true };
    sessionProducts.unshift(newP);
    res.json(newP);
});

app.patch("/api/products/:id/stock", auth, async (req, res) => {
    const { id } = req.params;
    if (dbConnected && !id.startsWith("s") && !id.startsWith("m")) {
        try {
            const product = await Product.findById(id);
            if (product) {
                product.inStock = !product.inStock;
                await product.save();
                return res.json(product);
            }
        } catch (err) { }
    }
    const product = sessionProducts.find(p => p._id === id);
    if (product) {
        product.inStock = !product.inStock;
        return res.json(product);
    }
    res.status(404).json({ message: "Product not found" });
});

app.delete("/api/products/:id", auth, async (req, res) => {
    const { id } = req.params;
    if (dbConnected && !id.startsWith("s") && !id.startsWith("m")) {
        try {
            await Product.findByIdAndDelete(id);
            return res.json({ msg: "deleted from db" });
        } catch (e) { }
    }
    sessionProducts = sessionProducts.filter(p => p._id !== id);
    res.json({ msg: "deleted from session" });
});

// --- ORDERS API ---
app.post("/api/orders", async (req, res) => {
    const { customerName, address, phone, city, productName, productPrice } = req.body;
    const totalPrice = Number(productPrice) + 300;
    if (dbConnected) {
        try {
            const o = new Order({ customerName, address, phone, city, productName, totalPrice });
            await o.save();
            return res.json(o);
        } catch (e) { /* fall back */ }
    }
    const newO = { _id: "o" + Date.now(), customerName, address, phone, city, productName, totalPrice, date: new Date() };
    sessionOrders.unshift(newO);
    res.json(newO);
});

app.get("/api/orders", auth, async (req, res) => {
    try {
        let dbOrders = [];
        if (dbConnected) dbOrders = await Order.find().sort({ date: -1 });
        res.json([...dbOrders, ...sessionOrders]);
    } catch (e) { res.json(sessionOrders); }
});

// --- FRONTEND ---
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });
app.get("/api/status", (req, res) => { res.json({ version: "v7.0-Stable", db: dbConnected }); });
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`SMI Store running at http://localhost:${PORT}`));
}
module.exports = app;

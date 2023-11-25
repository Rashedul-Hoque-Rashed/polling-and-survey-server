const express = require("express");
const cors = require("cors");
require('dotenv').config()
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: ['http://localhost:5173',
],
    credentials: true
}));
app.use(express.json());




app.get("/", (req, res) => {
    res.send('polling-and-survey is running');
})


app.listen(port, () => {
    console.log(`polling-and-survey is running on PORT: ${port}`)
})
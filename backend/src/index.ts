import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 1337;

app.use(cors({
    origin : 'http://localhost:5173'
}));

app.use(express.json());

app.listen(PORT, async() => {
    console.log(`Server running on http://localhost:${PORT}`);
});
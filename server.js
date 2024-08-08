import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import ConnectDB from "./testdata.js";
import generalRoutes from "./routes/general.js";

// CONFIGURATION

dotenv.config();

const app = express();

app.use(express.json());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(morgan("common"));
app.use(express.urlencoded({ extended: false }));
app.use(cors());
// ROUTES

app.use("/recruiting", generalRoutes);

// MONGOOSE SETUP

const PORT = process.env.PORT || 9000;

// ConnectDB();

app.listen(PORT, () => {
  console.log("Server is Running");
});

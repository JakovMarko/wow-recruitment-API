import express from "express";
import { getRecruits } from "../controllers/general.js";

const router = express.Router();

router.get("/getRecruits", getRecruits);

export default router;

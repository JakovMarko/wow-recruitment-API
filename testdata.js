import mongoose from "mongoose";

export default async function ConnectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URL);
    // console.log(`Connected to: ${conn.connection.host}`);
    // await Transaction.insertMany(dataTransaction);
    // await OverallStat.insertMany(dataOverallStat);
    // await AffiliateStat.insertMany(dataAffiliateStat);
    // console.log("finished inserting!");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

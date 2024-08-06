import mongoose from "mongoose";

const TestSchema = new mongoose.Schema(
  {
    charName: {
      type: String,
    },
    charServer: {
      type: String,
    },
    wowProgUrl: {
      type: String,
    },
    rioUrl: {
      type: String,
    },
    wclUrl: {
      type: String,
    },
    charCommentary: String,
    battleNet: String,
    discord: String,
  },
  { timestamps: true }
);

const Testdata = mongoose.model("testdata", TestSchema);

export default Testdata;

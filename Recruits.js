import mongoose from "mongoose";

const RecruitSchema = new mongoose.Schema(
  {
    charName: String,
    charServer: String,
    wowProgUrl: String,
    rioUrl: String,
    wclUrl: String,
    charID: String,
    charILVL: Number,
    charClass: String,
    charSpec: String,
    charProfilePicture: String,
    charCEList: [String], // Array of character achievements
    currentGuild: {
      name: String,
      realm: String,
    },
    guildWLCProfile: String,
    guildRankings: {
      amidrassil: Number,
      aberrus: Number,
      voti: Number,
    },
    charRaidProgress: {
      amidrassil: String,
      aberrus: String,
      voti: String,
    },
    charRecruitStatus: String,
    charCommentary: String,
    battleNet: String,
    discord: String,
    charRoleLogs: String,
    charLogsScore: {
      amidrassilBest: String,
      amidrassilMedian: String,
      aberrusBest: String,
      aberrusMedian: String,
      votiBest: String,
      votiMedian: String,
    },
    bossesKilled: {
      // Assuming a simplified structure for bossesKilled
      amidrassil: { type: Object }, // Or use a more complex object structure if needed
      aberrus: { type: Object },
      voti: { type: Object },
      sotfo: { type: Object },
      sod: { type: Object },
      nathria: { type: Object },
    },
  },
  { timestamps: true }
);

const Recruits = mongoose.model("Recruit", RecruitSchema);

export default Recruits;

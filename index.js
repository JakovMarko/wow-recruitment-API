import * as cheerio from "cheerio";
import Testdata from "./testSchema.js";
import ConnectDB from "./testdata.js";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
import { BlizzAPI } from "blizzapi";
// Configure ENV path
dotenv.config();

let charData = [];

async function main() {
  let startTime = Date.now();
  // await ConnectDB();

  // Get list of recruits from WoWProgress page
  async function getWowProgessRecruits() {
    const url =
      "https://www.wowprogress.com/gearscore/eu?lfg=1&raids_week=&lang=en&sortby=ts";
    try {
      const response = await fetch(url);
      const data = await response.text();
      const $ = cheerio.load(data);
      const links = $("#char_rating_container > table > tbody > tr > td > a");

      links.each(function () {
        const findRealm = this.attribs.href.split("/");
        if (findRealm.some((item) => item.includes("guild"))) {
          return;
        }

        let charName = $(this).text();
        let charServer = findRealm[3];
        if (charServer === "%D0%B3%D0%BE%D1%80%D0%B4%D1%83%D0%BD%D0%BD%D0%B8") {
          return;
        }
        if (
          charServer ===
          "%D1%80%D0%B5%D0%B2%D1%83%D1%89%D0%B8%D0%B9-%D1%84%D1%8C%D0%BE%D1%80%D0%B4"
        ) {
          return;
        }
        if (
          charServer ===
          "%D1%87%D0%B5%D1%80%D0%BD%D1%8B%D0%B9-%D1%88%D1%80%D0%B0%D0%BC"
        ) {
          return;
        }
        if (
          charServer ===
          "%D1%81%D0%B2%D0%B5%D0%B6%D0%B5%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C-%D0%B4%D1%83%D1%88"
        ) {
          return;
        }
        let wowProgUrl = `https://www.wowprogress.com/character/eu/${charServer.toLowerCase()}/${charName}`;
        let rioUrl = `https://www.raider.io/character/eu/${charServer.toLowerCase()}/${charName}`;
        let wclUrl = `https://www.warcraftlogs.com/character/eu/${charServer.toLowerCase()}/${charName.toLowerCase()}`;

        charData.push({ charName, charServer, wowProgUrl, rioUrl, wclUrl });
      });
    } catch (error) {
      console.error(error);
    }
  }

  // Get a list of recruits from the RaiderIO webpage
  async function getRIORecruits() {
    const url =
      "https://raider.io/search?type=character&recruitment.guild_raids.main_character.mainspec_ids[0][eq]=&recruitment.guild_raids.main_character.offspec_ids[0][eq]=&recruitment.guild_raids.profile.published_at[0][gte]=&recruitment.guild_raids.languages[0][eq]=1&region[0][eq]=eu&sort[recruitment.guild_raids.profile.published_at]=desc&page=1&pageSize=20";
    try {
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.goto(url);

      //  Get all links
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".slds-col span a"), (e) => ({
          charUrl: e.href,
          charName: e.innerHTML,
        }))
      );
      // Extract the server name from each characters raiderio homepage link as i could not get it any other way
      const getServer = links.map((item, index) => {
        return item.charUrl.split("/");
      });

      const rioData = links.map(({ charUrl, charName }, index) => ({
        charName,
        charServer: getServer[index][5],
        wowProgUrl: `https://www.wowprogress.com/character/eu/${getServer[index][5]}/${charName}`,
        rioUrl: charUrl,
        wclUrl: `https://www.warcraftlogs.com/character/eu/${getServer[index][5]}/${charName}`,
      }));

      for await (item of rioData) {
        charData.push(item);
      }

      await browser.close();
    } catch (error) {
      console.error(error);
    }
  }

  // Get player commentary from their WoWProgress profile page
  async function getPlayersDescription(arr) {
    for await (let element of arr) {
      const response = await fetch(element.wowProgUrl);

      const data = await response.text();
      const $ = cheerio.load(data);
      element.charCommentary = $(
        "#primary > div > div.primary > div.registeredTo > div.charCommentary"
      ).text();
    }
  }
  // Scraps wowprogress profile pages and retrieves users Battlenet contact info
  async function getWoWProgressBattleNet(arr) {
    for await (const element of arr) {
      const response = await fetch(element.wowProgUrl);

      const data = await response.text();
      const $ = cheerio.load(data);
      element.battleNet = $("span.profileBattletag").text().trim();
    }
  }

  // Go through wowprogress characterCommentary and extract discord users names
  /*  */
  async function getWoWProgressDiscord(arr) {
    for await (let element of arr) {
      if (element.charCommentary) {
        const battleNet = element.charCommentary;
        let descArr = battleNet.split(" ");
        let findDiscord = descArr.findLastIndex((item) =>
          item.toLowerCase().includes("discord")
        );
        if (findDiscord < 0) {
          element.discord = "";
        } else {
          let discord = descArr[findDiscord + 1].trim();
          if (
            descArr[findDiscord + 1] == "-" ||
            descArr[findDiscord + 1] == ":" ||
            descArr[findDiscord + 1] == "is"
          ) {
            discord = descArr[findDiscord + 2].trim();
          } else {
            discord = descArr[findDiscord + 1].trim();
          }
          if (discord.includes("\n")) {
            let newLineBug = discord.split("\n");
            discord = newLineBug[0];
          }

          element.discord = discord.trim();
        }
      } else {
        element.discord = "";
      }
    }
  }

  // FUNCTION FOR INSERTING DATA INTO THE DATABASE
  async function saveUserData(arr) {
    await ConnectDB();
    const testRun = await Testdata.insertMany(charData);
    console.log("finished inserting");
    process.exit(1);
  }

  // CHARACTER INFO FROM RAIDERIO API
  async function raiderioAPI(elements) {
    for await (const element of elements) {
      try {
        const response = await fetch(
          `https://raider.io/api/v1/characters/profile?region=eu&realm=${element.charServer}&name=${element.charName}&fields=gear%2Cguild%2Craid_progression%2Craid_achievement_curve%3Aamirdrassil-the-dreams-hope%3Aaberrus-the-shadowed-crucible%3Avault-of-the-incarnates%3Asepulcher-of-the-first-ones%3Asanctum-of-domination%3Acastle-nathria%3Auldir%3Athe-eternal-palace%3Acrucible-of-storms%3Anyalotha-the-wakng-city%3Athe-emerald-nightmare%3Atrial-of-valor%3Athe-nighthold%3Atomb-of-sargeras%3Aantorus-the-burning-throne%3A
  `
        );

        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        const data = await response.json();
        element.charILVL = data.gear["item_level_equipped"];
        element.charClass = data.class;
        element.charSpec = data["active_spec_name"];
        element.charProfilePicture = data["thumbnail_url"];
        element.charAchievementList = data["raid_achievement_curve"].filter(
          (item) => (item["cutting_edge"] ? item : null)
        );
        element.currentGuild = data.guild;
        // IF CHARACTER IS IN A GUILD GET THE GUILDS RANKINGS LAST EXPANSION
        if (element.currentGuild) {
          const guildResponse = await fetch(
            `https://raider.io/api/v1/guilds/profile?region=eu&realm=${
              element.charServer
            }&name=${element.currentGuild.name.toLowerCase()}&fields=raid_rankings`
          );
          if (!response.ok) {
            throw new Error("Network response was not ok");
          }

          const guildData = await guildResponse.json();
          if (guildData.statusCode == 400) {
            element.guildRankings = {
              amidrassil: 0,
              aberrus: 0,
              voti: 0,
            };
          } else {
            element.guildRankings = {
              amidrassil:
                guildData["raid_rankings"]["amirdrassil-the-dreams-hope"].mythic
                  .world,
              aberrus:
                guildData["raid_rankings"]["aberrus-the-shadowed-crucible"]
                  .mythic.world,
              voti: guildData["raid_rankings"]["vault-of-the-incarnates"].mythic
                .world,
            };
          }
        }
        element.charRaidProgress = {
          amidrassil:
            data.raid_progression["amirdrassil-the-dreams-hope"].summary,
          aberrus:
            data.raid_progression["aberrus-the-shadowed-crucible"].summary,
          voti: data.raid_progression["vault-of-the-incarnates"].summary,
        };
      } catch (error) {
        console.error("Error fetching character data:", error);
        throw error;
      }
    }
    console.log(elements);
  }
  // USING BLIZZARD API
  async function blizzardAPI() {
    let element = {
      charName: "Solidpally",
      charServer: "twisting-nether",
    };
    const BnetApi = new BlizzAPI({
      region: "eu",
      clientId: process.env.BLIZZARD_CLIENT_ID,
      clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
    });

    // character profile-endpoint as query param
    const character_query = await BnetApi.query(
      `/profile/wow/character/${
        element.charServer
      }/${element.charName.toLowerCase()}/mythic-keystone-profile/season/9?namespace=profile-eu`
    );

    console.log(character_query);
  }

  //GETTING INFORMATION FROM WARCRAFTLOGS API
  async function warcraftlogsAPI(elements) {
    const accessToken = process.env.ACCESS_TOKEN_ID; // Replace with your actual access token
    // let elements = [
    //   {
    //     charName: "Vaynard",
    //     charServer: "kazzak",
    //   },
    //   {
    //     charName: "Apofus",
    //     charServer: "kazzak",
    //   },
    //   {
    //     charName: "Unscripted",
    //     charServer: "kazzak",
    //   },
    // ];

    for (let element of elements) {
      const query = `{
        characterData {
          DPS:character(name: "${element.charName}", serverSlug: "${element.charServer}", serverRegion: "eu") {
            amidrassil: zoneRankings(difficulty:5,metric:dps,zoneID: 35, partition: -1),
            aberrus: zoneRankings(difficulty:5,metric:dps,zoneID: 33, partition: -1),
            voti: zoneRankings(difficulty:5,metric:dps,zoneID: 31, partition: -1),
  
            
  
          }
            HPS:character(name: "${element.charName}", serverSlug: "${element.charServer}", serverRegion: "eu") {
            amidrassil: zoneRankings(difficulty:5,metric:hps,zoneID: 35, partition: -1),
            aberrus: zoneRankings(difficulty:5,metric:hps,zoneID: 33, partition: -1),
            voti: zoneRankings(difficulty:5,metric:hps,zoneID: 31, partition: -1),
            sotfo: zoneRankings(difficulty:5,metric:dps,zoneID: 29, partition: -1),
            sod: zoneRankings(difficulty:5,metric:dps,zoneID: 28, partition: -1),
            nathria: zoneRankings(difficulty:5,metric:dps,zoneID: 26, partition: -1),
  
          }
        }
      }`;
      await fetchCharacterData(query);
    }

    async function fetchCharacterData(query) {
      try {
        const response = await fetch(
          "https://www.warcraftlogs.com/api/v2/client",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ query }),
          }
        );

        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        const data = await response.json();

        let charLogsScoreDPS = {
          amidrassilBest:
            data.data.characterData.DPS.amidrassil.bestPerformanceAverage,
          amidrassilMedian:
            data.data.characterData.DPS.amidrassil.medianPerformanceAverage,
          aberrusBest:
            data.data.characterData.DPS.aberrus.bestPerformanceAverage,
          aberrusMedian:
            data.data.characterData.DPS.aberrus.medianPerformanceAverage,
          votiBest: data.data.characterData.DPS.voti.bestPerformanceAverage,
          votiMedian: data.data.characterData.DPS.voti.medianPerformanceAverage,
        };
        let charLogsScoreHPS = {
          amidrassilBest:
            data.data.characterData.HPS.amidrassil.bestPerformanceAverage,
          amidrassilMedian:
            data.data.characterData.HPS.amidrassil.medianPerformanceAverage,
          aberrusBest:
            data.data.characterData.HPS.aberrus.bestPerformanceAverage,
          aberrusMedian:
            data.data.characterData.HPS.aberrus.medianPerformanceAverage,
          votiBest: data.data.characterData.HPS.voti.bestPerformanceAverage,
          votiMedian: data.data.characterData.HPS.voti.medianPerformanceAverage,
        };
        let bossesKilled = {
          amidrassil: {
            Gnarloot: data.data.characterData.HPS.amidrassil.rankings[0]
              .totalKills
              ? true
              : false,
            Igira: data.data.characterData.HPS.amidrassil.rankings[1].totalKills
              ? true
              : false,
            Volcoross: data.data.characterData.HPS.amidrassil.rankings[2]
              .totalKills
              ? true
              : false,
            Council: data.data.characterData.HPS.amidrassil.rankings[3]
              .totalKills
              ? true
              : false,
            Larodar: data.data.characterData.HPS.amidrassil.rankings[4]
              .totalKills
              ? true
              : false,
            Nymue: data.data.characterData.HPS.amidrassil.rankings[5].totalKills
              ? true
              : false,
            Smolderon: data.data.characterData.HPS.amidrassil.rankings[6]
              .totalKills
              ? true
              : false,
            Tindral: data.data.characterData.HPS.amidrassil.rankings[7]
              .totalKills
              ? true
              : false,
            Fyrakk: data.data.characterData.HPS.amidrassil.rankings[8]
              .totalKills
              ? true
              : false,
          },
          aberrus: {
            Kazzara: data.data.characterData.HPS.aberrus.rankings[0].totalKills
              ? true
              : false,
            Amalgamation: data.data.characterData.HPS.aberrus.rankings[1]
              .totalKills
              ? true
              : false,
            Experiments: data.data.characterData.HPS.aberrus.rankings[2]
              .totalKills
              ? true
              : false,
            Assault: data.data.characterData.HPS.aberrus.rankings[3].totalKills
              ? true
              : false,
            Rashok: data.data.characterData.HPS.aberrus.rankings[4].totalKills
              ? true
              : false,
            Zskarn: data.data.characterData.HPS.aberrus.rankings[5].totalKills
              ? true
              : false,
            Magmorax: data.data.characterData.HPS.aberrus.rankings[6].totalKills
              ? true
              : false,
            Neltharion: data.data.characterData.HPS.aberrus.rankings[7]
              .totalKills
              ? true
              : false,
            Sarkareth: data.data.characterData.HPS.aberrus.rankings[8]
              .totalKills
              ? true
              : false,
          },
          voti: {
            Eranog: data.data.characterData.HPS.voti.rankings[0].totalKills
              ? true
              : false,
            Terros: data.data.characterData.HPS.voti.rankings[1].totalKills
              ? true
              : false,
            Council: data.data.characterData.HPS.voti.rankings[2].totalKills
              ? true
              : false,
            Sennarth: data.data.characterData.HPS.voti.rankings[3].totalKills
              ? true
              : false,
            Dathea: data.data.characterData.HPS.voti.rankings[4].totalKills
              ? true
              : false,
            Kurog: data.data.characterData.HPS.voti.rankings[5].totalKills
              ? true
              : false,
            Diurna: data.data.characterData.HPS.voti.rankings[6].totalKills
              ? true
              : false,
            Raszageth: data.data.characterData.HPS.voti.rankings[7].totalKills
              ? true
              : false,
          },
          sotfo: {
            Vigilan: data.data.characterData.HPS.sotfo.rankings[0].totalKills
              ? true
              : false,
            Dausegne: data.data.characterData.HPS.sotfo.rankings[1].totalKills
              ? true
              : false,
            Xymox: data.data.characterData.HPS.sotfo.rankings[2].totalKills
              ? true
              : false,
            Pantheon: data.data.characterData.HPS.sotfo.rankings[3].totalKills
              ? true
              : false,
            Skolex: data.data.characterData.HPS.sotfo.rankings[4].totalKills
              ? true
              : false,
            Halondrus: data.data.characterData.HPS.sotfo.rankings[5].totalKills
              ? true
              : false,
            Lihuvim: data.data.characterData.HPS.sotfo.rankings[6].totalKills
              ? true
              : false,
            Anduin: data.data.characterData.HPS.sotfo.rankings[7].totalKills
              ? true
              : false,
            Lords: data.data.characterData.HPS.sotfo.rankings[8].totalKills
              ? true
              : false,
            Rygelon: data.data.characterData.HPS.sotfo.rankings[9].totalKills
              ? true
              : false,
            Jailer: data.data.characterData.HPS.sotfo.rankings[10].totalKills
              ? true
              : false,
          },
          sod: {
            Tarragrue: data.data.characterData.HPS.sod.rankings[0].totalKills
              ? true
              : false,
            EyeOfJailer: data.data.characterData.HPS.sod.rankings[1].totalKills
              ? true
              : false,
            TheNine: data.data.characterData.HPS.sod.rankings[2].totalKills
              ? true
              : false,
            Nerzhul: data.data.characterData.HPS.sod.rankings[3].totalKills
              ? true
              : false,
            Dormazain: data.data.characterData.HPS.sod.rankings[4].totalKills
              ? true
              : false,
            Painsmith: data.data.characterData.HPS.sod.rankings[5].totalKills
              ? true
              : false,
            Guardian: data.data.characterData.HPS.sod.rankings[6].totalKills
              ? true
              : false,
            Fatescribe: data.data.characterData.HPS.sod.rankings[7].totalKills
              ? true
              : false,
            Kelthuzad: data.data.characterData.HPS.sod.rankings[8].totalKills
              ? true
              : false,
            Sylvanas: data.data.characterData.HPS.sod.rankings[9].totalKills
              ? true
              : false,
          },
          nathria: {
            Shriewking: data.data.characterData.HPS.nathria.rankings[0]
              .totalKills
              ? true
              : false,
            Huntsman: data.data.characterData.HPS.nathria.rankings[1].totalKills
              ? true
              : false,
            HungeringDestroyer: data.data.characterData.HPS.nathria.rankings[2]
              .totalKills
              ? true
              : false,
            SunKing: data.data.characterData.HPS.nathria.rankings[3].totalKills
              ? true
              : false,
            Xymox: data.data.characterData.HPS.nathria.rankings[4].totalKills
              ? true
              : false,
            LadyInerva: data.data.characterData.HPS.nathria.rankings[5]
              .totalKills
              ? true
              : false,
            Council: data.data.characterData.HPS.nathria.rankings[6].totalKills
              ? true
              : false,
            Sludgefist: data.data.characterData.HPS.nathria.rankings[7]
              .totalKills
              ? true
              : false,
            Generals: data.data.characterData.HPS.nathria.rankings[8].totalKills
              ? true
              : false,
            Denathrius: data.data.characterData.HPS.nathria.rankings[9]
              .totalKills
              ? true
              : false,
          },
        };

        console.log(data.data);
      } catch (error) {
        console.error("Error fetching character data:", error);
        throw error;
      }
    }
  }

  await getWowProgessRecruits();
  // await getRIORecruits();
  await raiderioAPI(charData);
  // await getPlayersDescription(charData);
  // await getWoWProgressBattleNet(charData);
  // await getWoWProgressDiscord(charData);
  // await warcraftlogsAPI(charData);
  // await blizzardAPI();
  // console.log(charData);
  // await saveUserData(charData);

  // await testFetch();
  let finishTime = Date.now();

  console.log((finishTime - startTime) / 1000, " seconds");
}

main();

/*TESTING AND TROUBLESHOOTING SINGLE FETCH ETC...*/

async function testFetch() {
  const response = await fetch(
    "https://www.wowprogress.com/character/eu/thrall/Pyjamah"
  );

  const data = await response.text();
  const $ = cheerio.load(data);
  let charCommentary = $(
    "#primary > div > div.primary > div.registeredTo > div.charCommentary"
  ).text();
  const battleNet = charCommentary;
  console.log(battleNet);
  let descArr = battleNet.split(" ");
  let findDiscord = descArr.findIndex((item) =>
    item.toLowerCase().includes("discord")
  );
  if (findDiscord < 0) {
  }
  console.log("returnFromFind:", findDiscord < 0);
  let discord = descArr[findDiscord + 1].trim();
  console.log("first", discord);
  if (
    descArr[findDiscord + 1] == "-" ||
    descArr[findDiscord + 1] == ":" ||
    descArr[findDiscord + 1] == "is"
  ) {
    discord = descArr[findDiscord + 2].trim();
  } else {
    discord = descArr[findDiscord + 1].trim();
  }
  if (discord.includes("\n")) {
    let newLineBug = discord.split("\n");
    discord = newLineBug[0];
  }
  discord = discord.trim();
  console.log("stopreading here", discord);
}

// {
//   characterData {
//     Apofusvoti: character(name: "Apofus", serverSlug: "kazzak", serverRegion: "eu") {
//           mythic: zoneRankings(difficulty: 5, partition:-1, zoneID:31)
//           heroic: zoneRankings(difficulty: 4,partition:-1, zoneID:31)
//         }
//       }
//     characterData {
//      Apofus: character(name: "Apofus", serverSlug: "kazzak", serverRegion: "eu") {
//           mythic: zoneRankings(difficulty: 5, partition:-1, zoneID:31)
//           heroic: zoneRankings(difficulty: 4,partition:-1, zoneID:33)}}}

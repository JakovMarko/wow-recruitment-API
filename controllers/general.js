import * as cheerio from "cheerio";
import Recruits from "../Recruits.js";
import ConnectDB from "../testdata.js";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
import { BlizzAPI } from "blizzapi";

export const getRecruits = async (req, res) => {
  try {
    // Configure ENV path
    dotenv.config();
    let countID = 0;
    let recruitsArray = [];
    let testElements = [
      {
        charName: "Vaynard",
        charServer: "kazzak",
        charSpec: "Holy",
      },
      // {
      //   charName: "Apofus",
      //   charServer: "kazzak",
      // },
      // {
      //   charName: "Unscripted",
      //   charServer: "kazzak",
      // },
    ];

    async function main() {
      let startTime = Date.now();
      console.log(
        "Started proccess of collecting recruiters info please stand by...."
      );
      // Get list of recruits from WoWProgress page
      async function getWowProgessRecruits() {
        console.log("Collecting wowprogress recruits list....");
        const url =
          "https://www.wowprogress.com/gearscore/eu?lfg=1&raids_week=&lang=en&sortby=ts";
        try {
          const response = await fetch(url);
          const data = await response.text();
          const $ = cheerio.load(data);
          const links = $(
            "#char_rating_container > table > tbody > tr > td > a"
          );

          links.each(function () {
            const findRealm = this.attribs.href.split("/");
            if (findRealm.some((item) => item.includes("guild"))) {
              return;
            }

            let charName = $(this).text();
            let charServer = findRealm[3];
            if (
              charServer === "%D0%B3%D0%BE%D1%80%D0%B4%D1%83%D0%BD%D0%BD%D0%B8"
            ) {
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
            let rioUrl = `https://www.raider.io/characters/eu/${charServer.toLowerCase()}/${charName}`;
            let wclUrl = `https://www.warcraftlogs.com/character/eu/${charServer.toLowerCase()}/${charName.toLowerCase()}`;
            let charID = `${charName.toLowerCase()}-${charServer.toLowerCase()}`;
            recruitsArray.push({
              charName,
              charServer,
              wowProgUrl,
              rioUrl,
              wclUrl,
              charID,
            });
          });
          console.log("Finished collecting wowprogress recruits list....");
        } catch (error) {
          console.error(error);
        }
      }

      // Get a list of recruits from the RaiderIO webpage
      async function getRIORecruits() {
        console.log("Started collecting raiderio recruits list....");

        const url =
          "https://raider.io/search?type=character&recruitment.guild_raids.main_character.mainspec_ids[0][eq]=&recruitment.guild_raids.main_character.offspec_ids[0][eq]=&recruitment.guild_raids.profile.published_at[0][gte]=&recruitment.guild_raids.languages[0][eq]=1&region[0][eq]=eu&sort[recruitment.guild_raids.profile.published_at]=desc&page=1&pageSize=20";
        try {
          const browser = await puppeteer.launch();
          const page = await browser.newPage();
          await page.goto(url, { timeout: 60000 });
          console.log("connected to raiderIO recruitment page");
          //  Get all links
          const links = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".slds-col span a"), (e) => ({
              charUrl: e.href,
              charName: e.innerHTML,
            }))
          );

          await browser.close();
          console.log("closed pupeteer browser");

          // Extract the server name from each characters raiderio homepage link as i could not get it any other way
          const getServer = links.map((item, index) => {
            return item.charUrl.split("/");
          });

          links.forEach(({ charUrl, charName }, index) => {
            let charID = `${charName.toLowerCase()}-${getServer[
              index
            ][5].toLowerCase()}`;
            // CHECK IF RECRUIT WAS NOT ALREADY ADDED FROM WOWPROGRESS
            if (!recruitsArray.some((item) => item.charID == charID)) {
              recruitsArray.push({
                charName,
                charServer: getServer[index][5],
                wowProgUrl: `https://www.wowprogress.com/character/eu/${getServer[index][5]}/${charName}`,
                rioUrl: charUrl,
                wclUrl: `https://www.warcraftlogs.com/character/eu/${getServer[index][5]}/${charName}`,
                charID: `${charName.toLowerCase()}-${getServer[
                  index
                ][5].toLowerCase()}`,
              });
            }
          });

          console.log("Finished collecting raiderio recruits list....");
        } catch (error) {
          console.error(error);
        }
      }
      // CHECK IN THE DATABASE IF RECRUIT IS NOT ALREADY ADDED
      async function checkIfDuplicate(arr) {
        try {
          const databaseCharacterID = await Recruits.find({}, "charID").exec();
          let container = arr.slice();
          recruitsArray = container.filter((item) => {
            if (databaseCharacterID.some((i) => i.charID == item.charID)) {
              return "";
            } else {
              return item;
            }
          });
        } catch (error) {
          console.error(error);
        }
      }

      // Get player commentary from their WoWProgress profile page
      async function getPlayersDescription(arr) {
        for await (let element of arr) {
          const response = await fetch(element.wowProgUrl);
          if (!response.ok) {
            console.log("Network response was not ok, character not found");
            return;
            // throw new Error("Network response was not ok");
          }
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
          if (!response.ok) {
            console.log(
              "Network response was not ok, character not found",
              element.charName
            );
            return;
            // throw new Error("Network response was not ok");
          }
          const data = await response.text();
          const $ = cheerio.load(data);
          element.battleNet = $("span.profileBattletag").text().trim();
        }
      }

      // Go through wowprogress characterCommentary and extract discord users names
      /*  */
      async function getWoWProgressDiscord(arr) {
        for await (let element of arr) {
          if (element.charCommentary.length > 1) {
            let descArr = element.charCommentary
              .split("\n")
              .join(" ")
              .split(" ");
            let discordIndex = descArr.findLastIndex((item) =>
              item.toLowerCase().includes("discord")
            );
            let discord = descArr[discordIndex + 1];
            if (discordIndex < 0) {
              element.discord = "";
            } else {
              discord = descArr[discordIndex + 1].trim();
              if (
                descArr[discordIndex + 1] == "-" ||
                descArr[discordIndex + 1] == ":" ||
                descArr[discordIndex + 1] == "is"
              ) {
                discord = descArr[discordIndex + 2].trim();
              } else if (discord.includes(":")) {
                let discordInfo = discord.split(":");
                discord = discordInfo[1];
              } else if (discord.includes("-")) {
                let discordInfo = discord.split("-");
                discord = discordInfo[1];
              } else {
                discord = descArr[discordIndex + 1].trim();
              }

              element.discord = discord.trim();
            }
          }
        }
      }

      // FUNCTION FOR INSERTING DATA INTO THE DATABASE
      async function saveUserData(arr) {
        if (recruitsArray.length > 0) {
          const testRun = await Recruits.insertMany(recruitsArray);
        }
        console.log(
          "finished inserting ",
          recruitsArray.length,
          " new recruits"
        );
      }

      // CHARACTER INFO FROM RAIDERIO API
      async function raiderioAPI(elements) {
        for await (const element of elements) {
          try {
            const response = await fetch(
              `https://raider.io/api/v1/characters/profile?region=eu&realm=${element.charServer}&name=${element.charName}&fields=gear%2Cguild%2Craid_progression%2Craid_achievement_curve%3Aamirdrassil-the-dreams-hope%3Aaberrus-the-shadowed-crucible%3Avault-of-the-incarnates%3Asepulcher-of-the-first-ones%3Asanctum-of-domination%3Acastle-nathria%3Auldir%3Athe-eternal-palace%3Acrucible-of-storms%3Anyalotha-the-wakng-city%3Athe-emerald-nightmare%3Atrial-of-valor%3Athe-nighthold%3Atomb-of-sargeras%3Aantorus-the-burning-throne%3A
  `
            );

            if (response.ok) {
              const data = await response.json();
              element.charILVL = data.gear["item_level_equipped"];
              element.charClass = data.class;
              element.charSpec = data["active_spec_name"];
              element.charProfilePicture = data["thumbnail_url"];
              element.charCEList = data["raid_achievement_curve"]
                .filter((item) => (item["cutting_edge"] ? item : null))
                .map((item) => item.raid);
              element.currentGuild = data.guild;
              // IF CHARACTER IS IN A GUILD GET THE GUILDS RANKINGS LAST EXPANSION FROM RAIDERIO API
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
                  element.guildWLCProfile = guildData["profile_url"];

                  element.guildRankings = {
                    amidrassil:
                      guildData["raid_rankings"]["amirdrassil-the-dreams-hope"]
                        .mythic.world,
                    aberrus:
                      guildData["raid_rankings"][
                        "aberrus-the-shadowed-crucible"
                      ].mythic.world,
                    voti: guildData["raid_rankings"]["vault-of-the-incarnates"]
                      .mythic.world,
                  };
                }
              }

              // RECEIVE CHARACTER RAID PROGRESS FOR THE LAST 3 RAIDS IN THE FORMAT AMIDRASSIL:'9/9 M'  ETC
              element.charRaidProgress = {
                amidrassil:
                  data.raid_progression["amirdrassil-the-dreams-hope"].summary,
                aberrus:
                  data.raid_progression["aberrus-the-shadowed-crucible"]
                    .summary,
                voti: data.raid_progression["vault-of-the-incarnates"].summary,
              };

              // SEPARATE ALL THE PEOPLE THAT EITHER HAVE CE OR AT LEAST SOME LATE MYTHIC PROGRESS
              // GIVING THEM 'PENDING' STATUS FROM NO EXP PLAYERS THAT WILL AUTOMATICALY GET FLAGED WITH 'REJECTED' STATUS AND PUT INTO THE UNDERPERFORMERS BRACKED
              if (element.charCEList.length > 0) {
                element.charRecruitStatus = "pending";
              } else if (
                element.charRaidProgress.amidrassil == "7/9 M" ||
                element.charRaidProgress.amidrassil == "8/9 M" ||
                element.charRaidProgress.amidrassil == "9/9 M"
              ) {
                element.charRecruitStatus = "pending";
              } else if (
                element.charRaidProgress.aberrus == "7/9 M" ||
                element.charRaidProgress.aberrus == "8/9 M" ||
                element.charRaidProgress.aberrus == "9/9 M"
              ) {
                element.charRecruitStatus = "pending";
              } else if (
                element.charRaidProgress.voti == "6/8 M" ||
                element.charRaidProgress.voti == "7/8 M" ||
                element.charRaidProgress.voti == "8/8 M"
              ) {
                element.charRecruitStatus = "pending";
              } else {
                element.charRecruitStatus = "rejected";
              }
            }
          } catch (error) {
            console.error("Error fetching character data:", error);
            throw error;
          }
        }
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
        const accessToken = process.env.ACCESS_TOKEN_ID;

        for (let element of elements) {
          if (element.charSpec) {
            let charRole = "";
            let query = "";
            if (
              element.charSpec === "Holy" ||
              element.charSpec === "Discipline" ||
              element.charSpec === "Restoration" ||
              element.charSpec === "Preservation" ||
              element.charSpec === "Mistweaver"
            ) {
              element.charRoleLogs = "HPS";

              query = `{
          characterData {
              character(name: "${element.charName}", serverSlug: "${element.charServer}", serverRegion: "eu") {
              amidrassil: zoneRankings(difficulty:5,metric:hps,zoneID: 35, partition: -1),
              aberrus: zoneRankings(difficulty:5,metric:hps,zoneID: 33, partition: -1),
              voti: zoneRankings(difficulty:5,metric:hps,zoneID: 31, partition: -1),
              sotfo: zoneRankings(difficulty:5,metric:hps,zoneID: 29, partition: -1),
              sod: zoneRankings(difficulty:5,metric:hps,zoneID: 28, partition: -1),
              nathria: zoneRankings(difficulty:5,metric:hps,zoneID: 26, partition: -1),    
            }
          }
        }`;
            } else {
              element.charRoleLogs = "DPS";
              query = `{
          characterData {
            character(name: "${element.charName}", serverSlug: "${element.charServer}", serverRegion: "eu") {
              amidrassil: zoneRankings(difficulty:5,metric:dps,zoneID: 35, partition: -1),
              aberrus: zoneRankings(difficulty:5,metric:dps,zoneID: 33, partition: -1),
              voti: zoneRankings(difficulty:5,metric:dps,zoneID: 31, partition: -1),
              sotfo: zoneRankings(difficulty:5,metric:dps,zoneID: 29, partition: -1),
              sod: zoneRankings(difficulty:5,metric:dps,zoneID: 28, partition: -1),
              nathria: zoneRankings(difficulty:5,metric:dps,zoneID: 26, partition: -1),
              
    
            }
          }
        }`;
            }
            // console.log("fetching warcraftlogs data form ID:", countID);
            await fetchCharacterData(query, element);
            // console.log("finished fetching data for ID:", countID);
            countID++;
          }

          async function fetchCharacterData(query, element) {
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

              if (data.data.characterData.character) {
                element.charLogsScore = {
                  amidrassilBest: data.data.characterData.character.amidrassil
                    .bestPerformanceAverage
                    ? data.data.characterData.character.amidrassil.bestPerformanceAverage.toFixed(
                        1
                      )
                    : 0,
                  amidrassilMedian: data.data.characterData.character.amidrassil
                    .medianPerformanceAverage
                    ? data.data.characterData.character.amidrassil.medianPerformanceAverage.toFixed(
                        1
                      )
                    : 0,
                  aberrusBest: data.data.characterData.character.aberrus
                    .bestPerformanceAverage
                    ? data.data.characterData.character.aberrus.bestPerformanceAverage.toFixed(
                        1
                      )
                    : 0,
                  aberrusMedian: data.data.characterData.character.aberrus
                    .medianPerformanceAverage
                    ? data.data.characterData.character.aberrus.medianPerformanceAverage.toFixed(
                        1
                      )
                    : 0,
                  votiBest: data.data.characterData.character.voti
                    .bestPerformanceAverage
                    ? data.data.characterData.character.voti.bestPerformanceAverage.toFixed(
                        1
                      )
                    : 0,
                  votiMedian: data.data.characterData.character.voti
                    .medianPerformanceAverage
                    ? data.data.characterData.character.voti.medianPerformanceAverage.toFixed(
                        1
                      )
                    : 0,
                };

                element.bossesKilled = {
                  amidrassil: {
                    Gnarloot: data.data.characterData.character.amidrassil
                      .rankings[0].totalKills
                      ? true
                      : false,
                    Igira: data.data.characterData.character.amidrassil
                      .rankings[1].totalKills
                      ? true
                      : false,
                    Volcoross: data.data.characterData.character.amidrassil
                      .rankings[2].totalKills
                      ? true
                      : false,
                    Council: data.data.characterData.character.amidrassil
                      .rankings[3].totalKills
                      ? true
                      : false,
                    Larodar: data.data.characterData.character.amidrassil
                      .rankings[4].totalKills
                      ? true
                      : false,
                    Nymue: data.data.characterData.character.amidrassil
                      .rankings[5].totalKills
                      ? true
                      : false,
                    Smolderon: data.data.characterData.character.amidrassil
                      .rankings[6].totalKills
                      ? true
                      : false,
                    Tindral: data.data.characterData.character.amidrassil
                      .rankings[7].totalKills
                      ? true
                      : false,
                    Fyrakk: data.data.characterData.character.amidrassil
                      .rankings[8].totalKills
                      ? true
                      : false,
                  },
                  aberrus: {
                    Kazzara: data.data.characterData.character.aberrus
                      .rankings[0].totalKills
                      ? true
                      : false,
                    Amalgamation: data.data.characterData.character.aberrus
                      .rankings[1].totalKills
                      ? true
                      : false,
                    Experiments: data.data.characterData.character.aberrus
                      .rankings[2].totalKills
                      ? true
                      : false,
                    Assault: data.data.characterData.character.aberrus
                      .rankings[3].totalKills
                      ? true
                      : false,
                    Rashok: data.data.characterData.character.aberrus
                      .rankings[4].totalKills
                      ? true
                      : false,
                    Zskarn: data.data.characterData.character.aberrus
                      .rankings[5].totalKills
                      ? true
                      : false,
                    Magmorax: data.data.characterData.character.aberrus
                      .rankings[6].totalKills
                      ? true
                      : false,
                    Neltharion: data.data.characterData.character.aberrus
                      .rankings[7].totalKills
                      ? true
                      : false,
                    Sarkareth: data.data.characterData.character.aberrus
                      .rankings[8].totalKills
                      ? true
                      : false,
                  },
                  voti: {
                    Eranog: data.data.characterData.character.voti.rankings[0]
                      .totalKills
                      ? true
                      : false,
                    Terros: data.data.characterData.character.voti.rankings[1]
                      .totalKills
                      ? true
                      : false,
                    Council: data.data.characterData.character.voti.rankings[2]
                      .totalKills
                      ? true
                      : false,
                    Sennarth: data.data.characterData.character.voti.rankings[3]
                      .totalKills
                      ? true
                      : false,
                    Dathea: data.data.characterData.character.voti.rankings[4]
                      .totalKills
                      ? true
                      : false,
                    Kurog: data.data.characterData.character.voti.rankings[5]
                      .totalKills
                      ? true
                      : false,
                    Diurna: data.data.characterData.character.voti.rankings[6]
                      .totalKills
                      ? true
                      : false,
                    Raszageth: data.data.characterData.character.voti
                      .rankings[7].totalKills
                      ? true
                      : false,
                  },
                  sotfo: {
                    Vigilan: data.data.characterData.character.sotfo.rankings[0]
                      .totalKills
                      ? true
                      : false,
                    Dausegne: data.data.characterData.character.sotfo
                      .rankings[1].totalKills
                      ? true
                      : false,
                    Xymox: data.data.characterData.character.sotfo.rankings[2]
                      .totalKills
                      ? true
                      : false,
                    Pantheon: data.data.characterData.character.sotfo
                      .rankings[3].totalKills
                      ? true
                      : false,
                    Skolex: data.data.characterData.character.sotfo.rankings[4]
                      .totalKills
                      ? true
                      : false,
                    Halondrus: data.data.characterData.character.sotfo
                      .rankings[5].totalKills
                      ? true
                      : false,
                    Lihuvim: data.data.characterData.character.sotfo.rankings[6]
                      .totalKills
                      ? true
                      : false,
                    Anduin: data.data.characterData.character.sotfo.rankings[7]
                      .totalKills
                      ? true
                      : false,
                    Lords: data.data.characterData.character.sotfo.rankings[8]
                      .totalKills
                      ? true
                      : false,
                    Rygelon: data.data.characterData.character.sotfo.rankings[9]
                      .totalKills
                      ? true
                      : false,
                    Jailer: data.data.characterData.character.sotfo.rankings[10]
                      .totalKills
                      ? true
                      : false,
                  },
                  sod: {
                    Tarragrue: data.data.characterData.character.sod.rankings[0]
                      .totalKills
                      ? true
                      : false,
                    EyeOfJailer: data.data.characterData.character.sod
                      .rankings[1].totalKills
                      ? true
                      : false,
                    TheNine: data.data.characterData.character.sod.rankings[2]
                      .totalKills
                      ? true
                      : false,
                    Nerzhul: data.data.characterData.character.sod.rankings[3]
                      .totalKills
                      ? true
                      : false,
                    Dormazain: data.data.characterData.character.sod.rankings[4]
                      .totalKills
                      ? true
                      : false,
                    Painsmith: data.data.characterData.character.sod.rankings[5]
                      .totalKills
                      ? true
                      : false,
                    Guardian: data.data.characterData.character.sod.rankings[6]
                      .totalKills
                      ? true
                      : false,
                    Fatescribe: data.data.characterData.character.sod
                      .rankings[7].totalKills
                      ? true
                      : false,
                    Kelthuzad: data.data.characterData.character.sod.rankings[8]
                      .totalKills
                      ? true
                      : false,
                    Sylvanas: data.data.characterData.character.sod.rankings[9]
                      .totalKills
                      ? true
                      : false,
                  },
                  nathria: {
                    Shriewking: data.data.characterData.character.nathria
                      .rankings[0].totalKills
                      ? true
                      : false,
                    Huntsman: data.data.characterData.character.nathria
                      .rankings[1].totalKills
                      ? true
                      : false,
                    HungeringDestroyer: data.data.characterData.character
                      .nathria.rankings[2].totalKills
                      ? true
                      : false,
                    SunKing: data.data.characterData.character.nathria
                      .rankings[3].totalKills
                      ? true
                      : false,
                    Xymox: data.data.characterData.character.nathria.rankings[4]
                      .totalKills
                      ? true
                      : false,
                    LadyInerva: data.data.characterData.character.nathria
                      .rankings[5].totalKills
                      ? true
                      : false,
                    Council: data.data.characterData.character.nathria
                      .rankings[6].totalKills
                      ? true
                      : false,
                    Sludgefist: data.data.characterData.character.nathria
                      .rankings[7].totalKills
                      ? true
                      : false,
                    Generals: data.data.characterData.character.nathria
                      .rankings[8].totalKills
                      ? true
                      : false,
                    Denathrius: data.data.characterData.character.nathria
                      .rankings[9].totalKills
                      ? true
                      : false,
                  },
                };
              }
            } catch (error) {
              console.error("Error fetching character data:", error);
              throw error;
            }
          }
        }
      }

      await ConnectDB();
      await getWowProgessRecruits();
      await getRIORecruits();
      await checkIfDuplicate(recruitsArray);
      await raiderioAPI(recruitsArray);
      await getPlayersDescription(recruitsArray);
      await getWoWProgressBattleNet(recruitsArray);
      await getWoWProgressDiscord(recruitsArray);
      await warcraftlogsAPI(recruitsArray);
      await saveUserData(recruitsArray);
      // await testFetch();
      // await blizzardAPI();
      let finishTime = Date.now();

      console.log((finishTime - startTime) / 1000, " seconds");
    }

    await main();

    console.log(
      "Successfuly finished collecting ",
      recruitsArray.length,
      " recruits"
    );
    res.status(200);
  } catch (error) {
    console.error(error);
    res.status(404).json({ message: error.message });
  }
};

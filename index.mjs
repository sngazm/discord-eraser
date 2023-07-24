import {
  Client,
  GatewayIntentBits
} from 'discord.js';
import { configDotenv } from 'dotenv';
import fs from 'fs';
import cron from 'node-cron';
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
  ],
});
configDotenv();

// `catogoryID`を自動リセットチャンネルが存在するカテゴリIDに置き換えてください
const categoryId = process.env.CATEGORY_ID || "";

let tasks = {};
if (fs.existsSync('tasks.json')) {
  tasks = JSON.parse(fs.readFileSync('tasks.json'));
}

async function resetChannel(guildId, channelId) {
  const guild = await client.guilds.fetch(guildId).catch(console.error);
  const channel = await guild.channels.fetch(channelId).catch(console.error);
  if (channel) {
    const pos = channel.position;
    const newChannel = await channel.clone();

    await channel.delete();

    newChannel.setPosition(pos);

    console.log(`Channel ${channel.name} has been reset in guild ${guildId}`);
    // タスクを削除
    removeResetTask(guildId, channelId);
    tasks[guildId].push(newChannel.id);
    fs.writeFileSync('tasks.json', JSON.stringify(tasks));
    setResetTask(guildId, newChannel.id);
  }
}

function setResetTask(guildId, channelId) {
  // 1日〜2週間（1440〜20160分）のランダムな間隔を設定
  const randomDays = Math.floor(Math.random() * 14 + 1);
  // チャンネルリセットのタスクをスケジュールする
  setTimeout(() => {
    resetChannel(guildId, channelId)
  }, randomDays * 1000 * 60 * 60 * 24)

  console.log(`Channel ${channelId} in guild ${guildId} will be reset in ${randomDays} days.`);
  // if (randomMinutes < 15) task.start();  // If the random interval is less than 15 minutes, start the task immediately
};

function removeResetTask(guildId, channelId) {
  if (tasks[guildId]) {
    const taskIndex = tasks[guildId].findIndex(taskChannelId => taskChannelId === channelId);
    if (taskIndex !== -1) {
      tasks[guildId].splice(taskIndex, 1);
      fs.writeFileSync('tasks.json', JSON.stringify(tasks));
    }
  }
}

client.once('ready', async () => {
  console.log('Ready!');

  Object.keys(tasks).forEach(guildId => {
    tasks[guildId].forEach(channelId => setResetTask(guildId, channelId));
  });
});

client.on("channelUpdate", (oldChannel, newChannel) => {
  console.log("channelUpdate");
  if (newChannel.parentId === categoryId && !tasks[newChannel.guild.id]?.includes(newChannel.id)) {  // A channel was added to the category
    if (!tasks[newChannel.guild.id]) tasks[newChannel.guild.id] = [];
    console.log(newChannel.id);
    tasks[newChannel.guild.id].push(newChannel.id);
    setResetTask(newChannel.guild.id, newChannel.id); // 新しいチャンネルが追加されたらタスクを開始

  } else if (oldChannel.parentId === categoryId && newChannel.parentId !== categoryId) {  // A channel was removed from the category
    // oldChannelがtasks.jsonに存在しているか確認する
    if (!tasks[oldChannel.guild.id]?.includes(oldChannel.id)) return;
    tasks[oldChannel.guild.id] = tasks[oldChannel.guild.id].filter(channelId => channelId !== oldChannel.id);
    removeResetTask(oldChannel.guild.id, oldChannel.id); // カテゴリからチャンネルが削除されたらタスクを削除

  }
  fs.writeFileSync('tasks.json', JSON.stringify(tasks));
});

client.login(process.env.DISCORD_BOT_TOKEN);
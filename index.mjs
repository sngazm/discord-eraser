import {
  AttachmentBuilder,
  Client,
  Collection,
  GatewayIntentBits
} from 'discord.js';
import { configDotenv } from 'dotenv';
import fs from 'fs';
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
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
    // チャンネルを削除する前にメッセージを取得できる限りすべて取得する
    let messages = [];
    let lastId;
    try {
      do {
        const fetchedMessages = await fetchMany(channel, { limit: 100, ...(lastId ? { before: lastId } : {}) });
        if (fetchedMessages.size > 0) {
          messages = [...messages, ...fetchedMessages.values()];
          lastId = fetchedMessages.last().id;
        } else {
          break;
        }
      } while (messages.length < 10000);
    } catch (error) {
      console.error(error);
    }
    // メッセージから投稿ユーザー名、タイムスタンプ、メッセージ内容を抽出してテキストファイルに保存する
    const text = messages.map(message => `${message.author.username} ${message.createdAt} ${message.content}`).join('\n');
    // テキストをローカルファイルに保存する
    fs.writeFileSync('messages.txt', text);
    const text_file = new AttachmentBuilder('./messages.txt', { name: 'messages.txt' });

    // テキストファイルをDiscordの墓場チャンネルに投稿する
    const graveyardChannel = await guild.channels.fetch(process.env.GRAVEYARD_CHANNEL_ID).catch(console.error);
    if (graveyardChannel) {
      graveyardChannel.send({ content: `Channel ${channel.name} in guild ${guild.name} has been reset.`, files: [text_file] });
    }

    // チャンネルをリセットする
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


function array2Collection(messages) {
  return new Collection(messages.slice().sort((a, b) => {
    const a_id = BigInt(a.id);
    const b_id = BigInt(b.id);
    return (a_id > b_id ? 1 : (a_id === b_id ? 0 : -1));
  }).map(e => [e.id, e]));
}

// メッセージを100件以上取得するための関数
async function fetchMany(channel, options = { limit: 50 }) {
  if ((options.limit ?? 50) <= 100) {
    return channel.messages.fetch(options);
  }

  if (typeof options.around === "string") {
    const messages = await channel.messages.fetch({ ...options, limit: 100 });
    const limit = Math.floor((options.limit - 100) / 2);
    if (messages.size < 100) {
      return messages;
    }
    const backward = fetchMany(channel, { limit, before: messages.last().id });
    const forward = fetchMany(channel, { limit, after: messages.first().id });
    return array2Collection([messages, ...await Promise.all([backward, forward])].flatMap(
      e => [...e.values()]
    ));
  }
  let temp;
  function buildParameter() {
    const req_cnt = Math.min(options.limit - messages.length, 100);
    if (typeof options.after === "string") {
      const after = temp
        ? temp.first().id : options.after
      return { ...options, limit: req_cnt, after };
    }
    const before = temp
      ? temp.last().id : options.before;
    return { ...options, limit: req_cnt, before };
  }
  const messages = [];
  while (messages.length < options.limit) {
    const param = buildParameter();
    temp = await channel.messages.fetch(param);
    messages.push(...temp.values());
    if (param.limit > temp.size) {
      break;
    }
  }
  return array2Collection(messages);
}
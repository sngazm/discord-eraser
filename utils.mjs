import fs from 'fs';
// utils.js
import { AttachmentBuilder, Collection } from 'discord.js';
import { configDotenv } from 'dotenv';
configDotenv();

// tasks.jsonを読み込む関数
export function loadTasks() {
    let tasks = {};
    if (fs.existsSync('tasks.json')) {
        tasks = JSON.parse(fs.readFileSync('tasks.json'));
    }
    return tasks;
}

export async function resetChannel(client, guildId, channelId) {
    const guild = await client.guilds.fetch(guildId).catch(console.error);
    const channel = await guild.channels.fetch(channelId).catch(console.error);
    if (channel) {
        // チャンネルを削除する前にメッセージを取得できる限りすべて取得してテキストファイルに保存する
        await archiveChannel(guild, channel);

        // チャンネルをリセットする
        const pos = channel.position;
        const newChannel = await channel.clone();
        newChannel.setPosition(pos);
        await channel.delete();
        console.log(`Channel ${channel.name} has been reset in guild ${guildId}`);
        // タスクを削除
        removeResetTask(guildId, channelId);
    }
}

async function archiveChannel(guild, channel) {
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
    const text = messages.map(message => `${message.author.displayName} ${message.createdAt} ${message.content}`).join('\n');
    // テキストをローカルファイルに保存する
    fs.writeFileSync('messages.txt', text);
    const text_file = new AttachmentBuilder('./messages.txt', { name: 'messages.txt' });

    // テキストファイルをDiscordの墓場チャンネルに投稿する
    const graveyardChannel = await guild.channels.fetch(process.env.GRAVEYARD_CHANNEL_ID).catch(console.error);
    if (graveyardChannel) {
        await graveyardChannel.send({ content: `Channel ${channel.name} in guild ${guild.name} has been reset.`, files: [text_file] });
    }
}

export function setResetTask(guildId, channelId) {
    let tasks = loadTasks();
    // 1日〜2週間（1440〜20160分）のランダムな間隔を設定
    const randomDays = Math.floor(Math.random() * 14 + 1);
    const resetTime = Date.now() + (randomDays * 1000 * 60 * 60 * 24);
    tasks[guildId] = tasks[guildId] || [];
    // すでに同じ guildId かつ channelId の組み合わせがある場合は無視
    if (!tasks[guildId].some(task => task.channelId === channelId)) {
        tasks[guildId].push({ channelId, resetTime }); // タスクをtasks.jsonに追加
        fs.writeFileSync('tasks.json', JSON.stringify(tasks, null, 2)); // フォーマット付きで書き込み

        console.log(`Channel ${channelId} in guild ${guildId} is scheduled for reset at ${resetTime}.`);
    }
}

export function removeResetTask(guildId, channelId) {
    let tasks = loadTasks();
    if (tasks[guildId]) {
        tasks[guildId] = tasks[guildId].filter(task => task.channelId !== channelId); // タスクをフィルタリングして削除
        fs.writeFileSync('tasks.json', JSON.stringify(tasks, null, 2));
    }
}

// メッセージを100件以上取得するための関数
export async function fetchMany(channel, options = { limit: 50 }) {
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

export function array2Collection(messages) {
    return new Collection(messages.slice().sort((a, b) => {
        const a_id = BigInt(a.id);
        const b_id = BigInt(b.id);
        return (a_id > b_id ? 1 : (a_id === b_id ? 0 : -1));
    }).map(e => [e.id, e]));
}

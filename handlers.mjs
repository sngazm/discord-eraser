// handlers.js
import { configDotenv } from 'dotenv';
import fs from 'fs';
configDotenv();

import { loadTasks, removeResetTask, resetChannel, setResetTask } from './utils.mjs';
const categoryId = process.env.CATEGORY_ID || "";

export function handleReady(client, cron) {
    return async () => {
        console.log('Ready!');
        // tasks.jsonを読み込む
        let tasks = loadTasks();
        // cronジョブを設定して定期的にtasks.jsonをチェックしてリセットを実行
        cron.schedule('* * * * *', () => {
            const now = Date.now();
            for (const guildId in tasks) {
                tasks[guildId] = tasks[guildId].filter(task => {
                    if (task.resetTime <= now) {
                        resetChannel(client, guildId, task.channelId);
                        return false;
                    }
                    return true;
                });
            }
        });
    };
}

export function handleChannelUpdate(oldChannel, newChannel) {
    console.log("channelUpdate");
    let tasks = loadTasks();
    if (newChannel.parentId === categoryId && !tasks[newChannel.guild.id]?.includes(newChannel.id)) {  // A channel was added to the category
        if (!tasks[newChannel.guild.id]) {
            tasks[newChannel.guild.id] = [];
            fs.writeFileSync('tasks.json', JSON.stringify(tasks, null, 2));
        }
        setResetTask(newChannel.guild.id, newChannel.id); // 新しいチャンネルが追加されたらタスクを開始

    } else if (oldChannel.parentId === categoryId && newChannel.parentId !== categoryId) {  // A channel was removed from the category
        if (tasks[oldChannel.guild.id]) {
            removeResetTask(oldChannel.guild.id, oldChannel.id); // カテゴリからチャンネルが削除されたらタスクを削除
        }
    }
}

export function handleChannelCreate(channel) {
    console.log("channelCreate");
    if (channel.parentId === categoryId) {  // A new channel was created in the category
        setResetTask(channel.guild.id, channel.id); // 新しいチャンネルが作成されたらタスクを開始
    }
}

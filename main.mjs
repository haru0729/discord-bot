// main.mjs - Discord Botのメインプログラム

// 必要なライブラリを読み込み
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Partials } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import { recordTable } from "./recordTable.mjs";

// .envファイルから環境変数を読み込み
dotenv.config();

// Discord Botクライアントを作成
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,             // サーバー情報取得
        GatewayIntentBits.GuildMessages,       // メッセージ取得
        GatewayIntentBits.MessageContent,     // メッセージ内容取得
        GatewayIntentBits.GuildMembers,       // メンバー情報取得
        GatewayIntentBits.GuildMessageReactions // リアクション取得
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ---------------------------
// スラッシュコマンド登録
// ---------------------------
const commands = [
    new SlashCommandBuilder()
        .setName("gacha")
        .setDescription("ガチャを回す")
        .addSubcommand(sub =>
            sub.setName("record")
               .setDescription("ガチャ結果を表示する")
               .addIntegerOption(opt =>
                   opt.setName("count")
                      .setDescription("引く回数（最大10）")
                      .setRequired(false)
               )
        )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("⏳ スラッシュコマンドを登録中...");
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log("✅ スラッシュコマンドを登録しました！");
    } catch (error) {
        console.error("❌ コマンド登録エラー:", error);
    }
})();


// Botが起動完了したときの処理
const NOTIFY_CHANNEL_ID = "1409423000897327226"
client.once('clientReady', async () => {
    console.log(`🎉 ${client.user.tag} が正常に起動しました！`);
    console.log(`📊 ${client.guilds.cache.size} つのサーバーに参加中`);

    const channel = client.channels.cache.get(NOTIFY_CHANNEL_ID);
    if (channel) {
        channel.send(`✅ ${client.user.tag} がオンラインになりました！`);
    }
});

// メッセージが送信されたときの処理
client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    if (message.content.toLowerCase() === 'hello') {
        message.reply('りんりりーん！お届け物です！');
        console.log(`📝 ${message.author.tag} が hello コマンドを使用`);
    }
});

// ---------------------------
// ガチャコマンド
// ---------------------------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "gacha" && interaction.options.getSubcommand() === "record") {
        // 回数を取得（デフォルト 1、最大 10）
        let count = interaction.options.getInteger("count") || 1;
        if (count > 100) count = 100;

        let results = [];

        for (let i = 0; i < count; i++) {
            const rollIndex = Math.floor(Math.random() * recordTable.length);
            const result = recordTable[rollIndex];
            const roll2 = Math.floor(Math.random() * 2);

            if (roll2 && result) {
                results.push(`💿『${result.label}』`);
            } else {
                results.push(`🗑️『余ったレコード』`);
            }
        }

        await interaction.reply({
            content: `レコードガチャ (${count}回)の結果は\n${results.join("\n")}`,
            ephemeral: false // 公開で良ければ false, 個人のみなら true
        });
    }
});

// ---------------------------
// 🎯 複数リアクションロール設定
// ---------------------------
const reactionRoles = {
    "🐧": "1409416280737316925", // ロールID
    "🍊": "1409416412858023967", // ロールID
};

const config = {
    channelId: "1409418758308757595", // チャンネルID
    messageId: "1409418982389317683"  // メッセージID
};

// ---------------------------
// リアクション追加
// ---------------------------
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    if (reaction.message.id === config.messageId) {
        const roleId = reactionRoles[reaction.emoji.name];
        if (!roleId) return;

        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id);

        if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId);
            console.log(`✅ ${member.user.tag} にロール(${roleId})を付与しました`);

            try {
                await user.send(`✅ あなたに <@&${roleId}> ロールを付与しました！`);
            } catch (err) {
                console.error(`❌ ${user.tag} にDMを送信できませんでした`);
            }
        }
    }
});

// ---------------------------
// リアクション削除
// ---------------------------
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    if (reaction.message.id === config.messageId) {
        const roleId = reactionRoles[reaction.emoji.name];
        if (!roleId) return;

        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id);

        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            console.log(`🗑️ ${member.user.tag} からロール(${roleId})を削除しました`);

            try {
                await user.send(`🗑️ あなたから <@&${roleId}> ロールを削除しました！`);
            } catch (err) {
                console.error(`❌ ${user.tag} にDMを送信できませんでした`);
            }
        }
    }
});

// エラーハンドリング
client.on('error', (error) => {
    console.error('❌ Discord クライアントエラー:', error);
});

// プロセス終了時の処理
process.on('SIGINT', async () => {
    console.log('🛑 Botを終了しています...');
    try {
        const channel = client.channels.cache.get(NOTIFY_CHANNEL_ID);
        if (channel) {
            await channel.send(`❌ ${client.user.tag} がオフラインになりました…`);
        }
    } catch (err) {
        console.error("⚠️ 終了通知の送信に失敗:", err);
    }
    client.destroy();
    process.exit(0);
});

// Discord にログイン
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN が .env ファイルに設定されていません！');
    process.exit(1);
}

console.log('🔄 Discord に接続中...');
client.login(process.env.DISCORD_TOKEN)
    .catch(error => {
        console.error('❌ ログインに失敗しました:', error);
        process.exit(1);
    });

// Express Webサーバーの設定（Render用）
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({
        status: 'Bot is running! 🤖',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.listen(port, () => {
    console.log(`🌐 Web サーバーがポート ${port} で起動しました`);
});

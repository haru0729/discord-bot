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
        GatewayIntentBits.GuildMembers,        // メンバー情報取得
        GatewayIntentBits.GuildMessageReactions // リアクション取得
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ★これを追加してください（デバッグ用）
client.on("debug", (info) => console.log(`[DEBUG] ${info}`));
client.on("warn", (info) => console.log(`[WARN] ${info}`));

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
                       .setDescription("引く回数")
                       .setRequired(false)
                 )
                 .addIntegerOption(opt => 
                    opt.setName("rate")
                        .setDescription("レコード排出率(%)")
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(100)
                )
        )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("⏳ スラッシュコマンドを登録中...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log("✅ スラッシュコマンドを登録しました！");
    } catch (error) {
        console.error("❌ コマンド登録エラー:", error);
    }
})();

// ---------------------------
// 🎯 複数リアクションロール設定
// ---------------------------
const reactionRoles = {
    "🐧": "1409416280737316925", // ロールID
    "🍊": "1409416412858023967", // ロールID
};

const config = {
    channelId: "1409418758308757595", // チャンネルID
    messageId: "1409418982389317683"   // メッセージID
};

const config_event = {
    channelId: "1430513967884931135", // チャンネルID
    messageId: "1430530210721431564"  // メッセージID
};


// Botが起動完了したときの処理
const NOTIFY_CHANNEL_ID = "1409423000897327226"
client.once('clientReady', async () => {
    console.log(`🎉 ${client.user.tag} が正常に起動しました！`);
    console.log(`📊 ${client.guilds.cache.size} つのサーバーに参加中`);

    // 起動通知
    try {
        const channel = client.channels.cache.get(NOTIFY_CHANNEL_ID);
        if (channel) {
            await channel.send(`✅ ${client.user.tag} がオンラインになりました！`);
        }
    } catch (err) {
        console.warn("⚠️ 起動通知の送信に失敗:", err);
    }
});


// メッセージが送信されたときの処理
client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    if (message.content.toLowerCase() === 'hello') {
        message.reply('りんりりーん！お届け物です！！');
        console.log(`📝 ${message.author.tag} が hello コマンドを使用`);
    }
});

// ---------------------------
// ガチャコマンド
// ---------------------------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "gacha" && interaction.options.getSubcommand() === "record") {
        
        // 1. 応答を「保留」する (これで1回目の応答)
        await interaction.deferReply();

        // 回数を取得（デフォルト 1）
        let count = interaction.options.getInteger("count") || 1;
        if (count > 100) count = 100;

        let trashRate = interaction.options.getInteger("rate");
        if (trashRate === null) {
            trashRate = 50;
        }

        let results = [];

        for (let i = 0; i < count; i++) {
            const rollIndex = Math.floor(Math.random() * recordTable.length);
            const result = recordTable[rollIndex];
            const chance = Math.floor(Math.random() * 100);
            
            if (chance > trashRate) {
                results.push(`🗑️『余ったレコード』`);
            } else {
                // 当たり判定かつ、resultが存在する場合
                if (result) {
                    results.push(`💿『${result.label}』`);
                } else {
                    // 万が一 recordTable が空などの場合
                    results.push(`🗑️『余ったレコード』`);
                }
            }
        }

        // 2. 応答を「編集」する (reply ではなく editReply)
        await interaction.editReply({
            content: `レコードガチャ (${trashRate}%${count}回)の結果は\n${results.join("\n")}`,
        });
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

// ログインの直前に追加
console.log("トークンの確認:", process.env.DISCORD_TOKEN ? "設定されています (OK)" : "設定されていません (NG)");

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

// git add .
// git commit -m "コードを修正"
// git push origin main
// main.mjs - Discord Botのメインプログラム

// 必要なライブラリを読み込み
import { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType 
} from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import { GoogleGenerativeAI } from "@google/generative-ai"; // AIライブラリ
import { recordTable } from "./recordTable.mjs";

// .envファイルから環境変数を読み込み
dotenv.config();

// Gemini APIの設定
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

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

// デバッグ用ログ
client.on("debug", (info) => console.log(`[DEBUG] ${info}`));
client.on("warn", (info) => console.log(`[WARN] ${info}`));

// ---------------------------
// スラッシュコマンド登録
// ---------------------------
const commands = [
    new SlashCommandBuilder()
        .setName("gacha")
        .setDescription("ガチャ・クイズ機能")
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
        .addSubcommand(sub =>
            sub.setName("quiz")
                 .setDescription("引いたレコードが答えとなるAIクイズを出題！")
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
// 🎯 リアクションロール設定
// ---------------------------
const reactionRoles = {
    "🐧": "1409416280737316925",
    "🍊": "1409416412858023967",
};

const config = {
    channelId: "1409418758308757595",
    messageId: "1409418982389317683"
};

// ---------------------------
// Bot起動時の処理
// ---------------------------
const NOTIFY_CHANNEL_ID = "1409423000897327226";

// 注: 元のコードの 'clientReady' は標準イベントではないため 'ready' に修正しました
client.once('ready', async () => {
    console.log(`🎉 ${client.user.tag} が正常に起動しました！`);
    console.log(`📊 ${client.guilds.cache.size} つのサーバーに参加中`);

    try {
        const channel = client.channels.cache.get(NOTIFY_CHANNEL_ID);
        if (channel) {
            await channel.send(`✅ ${client.user.tag} がオンラインになりました！`);
        }
    } catch (err) {
        console.warn("⚠️ 起動通知の送信に失敗:", err);
    }
});

// ---------------------------
// メイン処理（インタラクション）
// ---------------------------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    // --- ガチャ引く機能(record) ---
    if (interaction.commandName === "gacha" && subcommand === "record") {
        await interaction.deferReply();
        let count = interaction.options.getInteger("count") || 1;
        if (count > 100) count = 100;
        let trashRate = interaction.options.getInteger("rate") ?? 50;

        let results = [];
        for (let i = 0; i < count; i++) {
            const rollIndex = Math.floor(Math.random() * recordTable.length);
            const result = recordTable[rollIndex];
            const chance = Math.floor(Math.random() * 100);
            
            if (chance > trashRate) {
                results.push(`🗑️『余ったレコード』`);
            } else {
                results.push(`💿『${result ? result.label : "不明なレコード"}』`);
            }
        }

        await interaction.editReply({
            content: `レコードガチャ (${trashRate}% / ${count}回)の結果は\n${results.join("\n")}`,
        });
    }

    // --- AIクイズ機能(quiz) ---
    if (interaction.commandName === "gacha" && subcommand === "quiz") {
        await interaction.deferReply();

        // 答えとなる曲をランダムに選ぶ
        const answerItem = recordTable[Math.floor(Math.random() * recordTable.length)];
        const answerSong = answerItem.label;

        try {
            // AIへの依頼（プロンプト）をより具体的に！
            const prompt = `
            あなたは「プロジェクトセカイ(プロセカ)」とボカロ文化を愛する、知識豊富なクイズ作成のプロです。
            楽曲「${answerSong}」が正解となるような、ファンが唸る面白い3択クイズを1問作成してください。
            
            【厳守するルール】
            1. クイズ本文に直接「${answerSong}」という曲名や、すぐに分かる単語を書かないでください。
            2. 「印象的な歌詞の一部」「作曲したボカロPの過去の代表作」「ゲーム内の3D/2D演出」「イベントのストーリー内容」など、少しマニアックで面白い特徴をヒントにしてください。
            3. ダミーの選択肢（別の実在する曲名）は、正解と雰囲気が似ている曲や、同じボカロPの曲にして、少し迷うようにしてください。
            4. 以下のJSON形式だけで出力してください。他の文章は一切不要です。
            {
              "question": "クイズの本文（少し長めで詳しい説明にする）",
              "options": ["${answerSong}", "ダミーの実在する曲1", "ダミーの実在する曲2"]
            }`;           const aiResult = await model.generateContent(prompt);
            const response = await aiResult.response;
            const text = response.text().replace(/```json|```/g, "").trim();
            const quizData = JSON.parse(text);

            // 選択肢をシャッフル
            const options = quizData.options.sort(() => Math.random() - 0.5);

            // ボタンを作成
            const row = new ActionRowBuilder().addComponents(
                options.map((opt, i) => 
                    new ButtonBuilder()
                        .setCustomId(`quiz_${i}_${opt === answerSong}`)
                        .setLabel(opt)
                        .setStyle(ButtonStyle.Primary)
                )
            );

            const message = await interaction.editReply({
                content: `**【レコード・AIクイズ】この曲は何？**\n\n${quizData.question}`,
                components: [row]
            });

            // 回答の受け付け
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 20000 // 1分間
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: "これは他の人のクイズです！", ephemeral: true });
                }
                
                const isCorrect = i.customId.endsWith('true');
                if (isCorrect) {
                    await i.update({ content: `✅ **正解！** 答えは **『${answerSong}』** でした！`, components: [] });
                } else {
                    await i.update({ content: `❌ **残念！** 正解は **『${answerSong}』** でした。`, components: [] });
                }
            });

        } catch (error) {
            console.error("AIクイズ生成エラー:", error);
            await interaction.editReply("❌ クイズの作成に失敗しました。もう一度試してください。");
        }
    }
});

// リアクション・エラー・プロセス終了処理などは元のまま維持
client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    if (message.content.toLowerCase() === 'hello') {
        message.reply('りんりりーん！お届け物です！！');
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.id === config.messageId) {
        const roleId = reactionRoles[reaction.emoji.name];
        if (!roleId) return;
        const member = await reaction.message.guild.members.fetch(user.id);
        if (!member.roles.cache.has(roleId)) await member.roles.add(roleId);
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.id === config.messageId) {
        const roleId = reactionRoles[reaction.emoji.name];
        if (!roleId) return;
        const member = await reaction.message.guild.members.fetch(user.id);
        if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);
    }
});

client.on('error', (error) => console.error('❌ Discord クライアントエラー:', error));

process.on('SIGINT', async () => {
    console.log('🛑 Botを終了しています...');
    client.destroy();
    process.exit(0);
});

// 起動確認
if (!process.env.DISCORD_TOKEN || !process.env.GEMINI_API_KEY) {
    console.error('❌ DISCORD_TOKEN または GEMINI_API_KEY が設定されていません！');
    process.exit(1);
}

console.log('🔄 Discord に接続中...');
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ ログイン失敗:', err);
    process.exit(1);
});

// Expressサーバー
const app = express();
const port = process.env.PORT || 10000; // ★この1行を追加しました
app.get('/', (req, res) => res.json({ status: 'Bot is running! 🤖' }));
app.listen(port, () => console.log(`🌐 Webサーバー起動: ポート ${port}`));
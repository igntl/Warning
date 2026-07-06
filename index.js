require("dotenv").config();
const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// 📌 إعدادات البوت
const TOKEN = process.env.TOKEN;
const SOURCE_CHANNEL = "1483219896069525665"; // روم المصدر
const LOG_CHANNEL = "1490286354175758366"; // روم اللوق
const ALLOWED_ROLE = "1523520246097514528"; // مسؤولين الشكاوى

// ⚡ الرولات والإنذارات
const ROLES = {
  verbal: { id: "1523519282707828756", name: "انذار شفهي", duration: 3 * 24 * 60 * 60 * 1000 }, // 3 أيام
  warn1: { id: "1523519193314758758", name: "انذار أول", duration: 14 * 24 * 60 * 60 * 1000 }, // أسبوعين
  warn2: { id: "1523519440451272794", name: "انذار ثاني", duration: 30 * 24 * 60 * 60 * 1000 }, // شهر
  warn3: { id: "1523519407379189890", name: "انذار ثالث", duration: 45 * 24 * 60 * 60 * 1000 }, // شهر ونصف
  block: { id: "1523519407379189890", name: "مستبعد من التقسيمة", duration: null },
  black: { id: "1498706382587822191", name: "بلاك ليست", duration: null },
  test: { id: null, name: "تجربة", duration: 60 * 60 * 1000 } // ساعة تجربة
};

// لتخزين التفاعل مؤقتًا
const temp = new Map();

client.once("ready", async () => {
  console.log("Bot Ready");

  const slash = [
    {
      name: "انذارات",
      description: "لوحة إعطاء الإنذارات",
      options: [
        {
          type: 6, // USER
          name: "الشخص",
          description: "اختر الشخص",
          required: true
        }
      ]
    }
  ];

  await client.application.commands.set(slash);
  console.log("Slash commands registered");
});

client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName !== "انذارات") return;

    if (!interaction.member.roles.cache.has(ALLOWED_ROLE))
      return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

    const user = interaction.options.getUser("الشخص");
    temp.set(interaction.user.id, { target: user.id });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("types")
      .setPlaceholder("اختر العقوبة")
      .addOptions([
        { label: "انذار شفهي", value: "verbal" },
        { label: "انذار أول", value: "warn1" },
        { label: "انذار ثاني", value: "warn2" },
        { label: "انذار ثالث", value: "warn3" },
        { label: "مستبعد من التقسيمة", value: "block" },
        { label: "بلاك ليست", value: "black" },
        { label: "تجربة", value: "test" }
      ]);

    return interaction.reply({
      content: "اختر العقوبة:",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "types") {
    const data = temp.get(interaction.user.id);
    data.type = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId("reasonModal")
      .setTitle("سبب العقوبة");
    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("اكتب السبب")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "reasonModal") {
    await interaction.deferReply({ ephemeral: true });

    const data = temp.get(interaction.user.id);
    const reason = interaction.fields.getTextInputValue("reason");
    const member = await interaction.guild.members.fetch(data.target);

    const roleInfo = ROLES[data.type];
    const role = roleInfo.id ? interaction.guild.roles.cache.get(roleInfo.id) : null;

    if (role) await member.roles.add(role);

    if (roleInfo.duration) {
      setTimeout(async () => {
        if (role && member.roles.cache.has(role.id)) await member.roles.remove(role);
      }, roleInfo.duration);
    }

    const embed = new EmbedBuilder()
      .setTitle("🚨 تم إعطاء عقوبة")
      .setColor(0xFF4C4C)
      .addFields(
        { name: "👤 المستخدم", value: `<@${member.id}>`, inline: true },
        { name: "👮 الإداري", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📋 العقوبة", value: roleInfo.name },
        { name: "📝 السبب", value: reason }
      )
      .setTimestamp();

    const log = interaction.guild.channels.cache.get(LOG_CHANNEL);
    if (log) log.send({ embeds: [embed] });

    await interaction.editReply({ content: "✅ تم تنفيذ العقوبة" });
    temp.delete(interaction.user.id);
  }
});

client.login(TOKEN);

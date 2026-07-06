const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TOKEN = process.env.TOKEN;

// 📌 الإعدادات
const ACTIVE_CHANNEL = "1483219896069525665"; // روم الإنذارات
const LOG_CHANNEL = "1490286354175758366"; // روم اللوق
const ALLOWED_ROLES = ["1523520246097514528"]; // مسؤولين الشكاوي

// ⚡ الإنذارات والمدة
const ROLES = {
  verbal: { id: "1523525037162893373", name: "انذار شفهي", duration: 3 * 24 * 60 * 60 * 1000 }, // 3 أيام
  warn1: { id: "1523519282707828756", name: "انذار أول", duration: 14 * 24 * 60 * 60 * 1000 }, // أسبوعين
  warn2: { id: "1523519193314758758", name: "انذار ثاني", duration: 30 * 24 * 60 * 60 * 1000 }, // شهر
  warn3: { id: "1523519440451272794", name: "انذار ثالث", duration: 45 * 24 * 60 * 60 * 1000 }, // شهر ونصف
  block: { id: "1523519407379189890", name: "مستبعد من التقسيمة", duration: null },
  black: { id: "1498706382587822191", name: "بلاك ليست", duration: null },
  test: { id: null, name: "تجربة", duration: 60 * 1000 } // دقيقة تجربة
};

const temp = new Map();
const activeWarnings = new Map(); // لتخزين الإنذارات الحالية لكل شخص

client.once("ready", async () => {
  console.log("Bot Ready");

  const cmd = new SlashCommandBuilder()
    .setName("انذارات")
    .setDescription("لوحة الإنذارات")
    .addUserOption(o => o.setName("الشخص").setDescription("اختر الشخص").setRequired(true));

  const checkCmd = new SlashCommandBuilder()
    .setName("فحص")
    .setDescription("يعرض الأشخاص اللي عليهم إنذارات");

  await client.application.commands.set([cmd, checkCmd]);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.channel || interaction.channel.id !== ACTIVE_CHANNEL) return;

  // تحقق صلاحية المسؤول
  const hasRole = interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
  if (!hasRole && interaction.isChatInputCommand()) return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

  // ===== أمر الفحص =====
  if (interaction.isChatInputCommand() && interaction.commandName === "فحص") {
    if (!activeWarnings.size) return interaction.reply({ content: "لا يوجد أي إنذارات حالياً.", ephemeral: true });

    const lines = [];
    for (const [userId, arr] of activeWarnings.entries()) {
      const member = await interaction.guild.members.fetch(userId);
      const info = arr.map(w => `${ROLES[w.type].name} - ${Math.ceil((w.endTime - Date.now())/(24*60*60*1000))} يوم`).join("\n");
      lines.push(`${member.user.tag}:\n${info}`);
    }
    return interaction.reply({ content: lines.join("\n\n") });
  }

  // ===== أمر الإنذارات =====
  if (interaction.isChatInputCommand() && interaction.commandName === "انذارات") {
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

  // ===== اختيار نوع العقوبة =====
  if (interaction.isStringSelectMenu() && interaction.customId === "types") {
    const data = temp.get(interaction.user.id);
    data.types = interaction.values;

    const needsDuration = data.types.some(t => ["block", "black"].includes(t));
    if (!needsDuration) {
      // مباشرة عرض سبب
      const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
      const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // إذا البلاك أو مستبعد، اختيارات مدة
    const menu = new StringSelectMenuBuilder()
      .setCustomId("duration")
      .setPlaceholder("اختر المدة")
      .addOptions([
        { label: "1 يوم", value: "1" },
        { label: "7 أيام", value: "7" },
        { label: "30 يوم", value: "30" },
        { label: "دائم", value: "permanent" }
      ]);
    return interaction.update({ content: "اختر المدة:", components: [new ActionRowBuilder().addComponents(menu)] });
  }

  // ===== اختيار مدة للبلاك أو مستبعد =====
  if (interaction.isStringSelectMenu() && interaction.customId === "duration") {
    const data = temp.get(interaction.user.id);
    data.duration = interaction.values[0];

    const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
    const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ===== كتابة السبب =====
  if (interaction.isModalSubmit() && interaction.customId === "reasonModal") {
    await interaction.deferReply({ ephemeral: true });
    const data = temp.get(interaction.user.id);
    const reason = interaction.fields.getTextInputValue("reason");
    const member = await interaction.guild.members.fetch(data.target);

    const log = interaction.guild.channels.cache.get(LOG_CHANNEL);

    for (const t of data.types) {
      const role = ROLES[t].id ? interaction.guild.roles.cache.get(ROLES[t].id) : null;
      const duration = ROLES[t].duration ?? (data.duration === "permanent" ? null : parseInt(data.duration)*24*60*60*1000);

      if (role) await member.roles.add(role);

      if (duration) {
        const endTime = Date.now() + duration;
        if (!activeWarnings.has(member.id)) activeWarnings.set(member.id, []);
        activeWarnings.get(member.id).push({ type: t, endTime });

        setTimeout(async () => {
          if (role && member.roles.cache.has(role.id)) await member.roles.remove(role);
          // حذف اللوق بعد انتهاء المدة
          if (log) {
            const messages = await log.messages.fetch({ limit: 50 });
            messages.forEach(msg => {
              if (msg.embeds[0]?.fields?.some(f => f.value.includes(member.id))) msg.delete().catch(()=>{});
            });
          }
          // إزالة من activeWarnings
          activeWarnings.set(member.id, activeWarnings.get(member.id).filter(w => w.type !== t));
          if (!activeWarnings.get(member.id).length) activeWarnings.delete(member.id);
        }, duration);
      }
    }

    // ===== إرسال اللوق =====
    const punishNames = data.types.map(t => ROLES[t].name).join(" + ");
    const durationsText = data.types.map(t => {
      if (t === "verbal") return "3 أيام";
      if (t === "warn1") return "14 يوم";
      if (t === "warn2") return "30 يوم";
      if (t === "warn3") return "45 يوم";
      if (t === "test") return "1 دقيقة";
      if (["black","block"].includes(t)) {
        if (data.duration === "permanent") return "دائم";
        return `${data.duration} يوم`;
      }
      return "";
    }).join(" + ");

    if (log) {
      const embed = new EmbedBuilder()
        .setTitle("🚨 تم إعطاء عقوبة")
        .setColor(0xFF4C4C)
        .addFields(
          { name: "👤 المستخدم", value: `<@${member.id}>`, inline: true },
          { name: "👮 الإداري", value: `<@${interaction.user.id}>`, inline: true },
          { name: "📋 العقوبات", value: punishNames },
          { name: "⏱ المدة", value: durationsText },
          { name: "📝 السبب", value: reason }
        )
        .setTimestamp();
      log.send({ embeds: [embed] });
    }

    await interaction.editReply({ content: "✅ تم تنفيذ العقوبة" });
    temp.delete(interaction.user.id);
  }
});

client.login(TOKEN);

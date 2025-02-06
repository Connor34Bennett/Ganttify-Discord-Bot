require('dotenv').config();
const keepAlive = require('./server.js');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { REST, Routes } = require('discord.js');
const { MongoClient, ObjectId } = require('mongodb');
const buildPath = require('./buildPath.js');
const cron = require('node-cron');

const { DISCORD_TOKEN, CLIENT_ID, MONGODB_URI, PORT } = process.env;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const guildReminderSelections = {};
const botGuildIds = new Set();
const botChannelIds = {};
const projectsAddedToServers = {};

function ensureDate(value) {
    if (value instanceof Date) {
      return value;
    }
    const date = new Date(value);
    if (!isNaN(date)) {
      return date;
    } else {
      throw new Error("Invalid date value provided");
    }
}

// let mongoClient;

function getActionRows(userSelections = []) {
    const options = ['7 Days Before', '5 Days Before', '3 Days Before', '1 Day Before'];
    const row = [];

    options.forEach((option, index) => {
        let checkBox;
        if(userSelections.includes(option)){
            checkBox = '☑️';
        }
        else{
            checkBox = '⬜️';
        }
        
        row.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(userSelections.includes(option) ? `${option}` : `${option}`)
                    .setLabel(`${checkBox}${option}`)
                    .setStyle(ButtonStyle.Primary),
            )
        );
    });

    return row;
}

// Slash Command Definitions
const commands = [
    {
        name: 'ping',
        description: 'Replies with Pong!',
    },
    {
        name: 'addproject',
        description: 'Loads project for bot',
        options: [
            {
                type: 3,
                name: 'invite_link',
                description: 'The project invite link',
                required: true,
            },
        ],
    },
    {
        name: 'print',
        description: 'prints projects',
    },
    {
        name: 'setreminders',
        description: 'Sets how long before a task you would like to be reminded',
    },
    {
        name: 'setchannel',
        description: 'Sets the bot’s main messaging channel',
        options: [
            {
                type: 7, // Channel type (7 is for channels)
                name: 'channel',
                description: 'Select the channel for bot messages',
                required: true,
            },
        ],
    },
];

// Register Slash Commands
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log('Refreshing slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, '1333851032295440556'),
            { body: commands }
        );
        console.log('Slash commands registered.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();



client.once('ready', async () => {
    const guilds = await client.guilds.fetch();

    guilds.forEach((guild) => {
        botGuildIds.add(guild.id);
    });

    client.guilds.cache.forEach((guild) => {
        const channelsInGuild = [];

        // Iterate through the channels in each guild
        guild.channels.cache.forEach((channel) => {
            // Check if the bot is in the channel and it's a text channel
            if (channel.type === 'GUILD_TEXT' && guild.members.cache.has(client.user.id)) {
                channelsInGuild.push(channel.id);  // Collect channel ID
            }
        });

        // If the bot is in any channel in this guild, store the IDs
        if (channelsInGuild.length > 0) {
            guildChannels[guild.id] = channelsInGuild;
            console.log(`Guild ${guild.name} has the following channels:`);
            console.log(guildChannels[guild.id]);  // Show collected channel IDs for the guild
        }
    });

    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('guildDelete', (guild) => {
    // Check if the guild ID exists in botChannelIds
    if (botChannelIds[guild.id]) {
        delete botChannelIds[guild.id]; // Remove the stored channel ID(s)
        console.log(`Bot was removed from guild: ${guild.name} (${guild.id}). Cleared stored channel data: `, botChannelIds[guild.id]);
    }
});

client.on('guildCreate', async (guild) => {
    try {
        // Get the system channel (where system messages like bot joins are sent)
        let channelId = guild.systemChannelId;

        // If the system channel isn't set or bot lacks permission, find the first text channel the bot can send messages in
        if (!channelId) {
            const channels = await guild.channels.fetch();
            const textChannel = channels.find(
                (channel) => 
                    (channel.type === 0 || channel.type === 5) &&
                    channel.permissionsFor(guild.members.me).has('SendMessages')
            );

            if (textChannel) {
                channelId = textChannel.id;
            }
        }

        botChannelIds[guild.id] = channelId;
        console.log("Channel ID:", botChannelIds[guild.id]);
        

        // if (channelId) {
        //     console.log(`Bot was added in channel: ${channelId}`);
        // } else {
        //     console.log("No suitable channel found.");
        // }
    } catch (error) {
        console.error(`Error fetching channels: ${error}`);
    }
});

client.on('interactionCreate', async (interaction) => {
    try {
        // If the interaction is a slash command
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            if (commandName === 'ping') {
                await interaction.reply('Pong!');
            }

            if (commandName === 'setchannel') {
                const { customId, guildId } = interaction;
                const value = customId;
                const selectedChannel = interaction.options.getChannel('channel');
                const channelId = selectedChannel.id;

                if (!selectedChannel || !(selectedChannel.type === 0 || selectedChannel.type === 5)) {
                    return interaction.reply({ content: 'Please select a valid text or news channel.'});
                }

                if (!selectedChannel.permissionsFor(interaction.guild.members.me).has('SEND_MESSAGES')) {
                    return interaction.reply({ content: 'I do not have permission to send messages in that channel.'});
                }

                if (botChannelIds[guildId]) {
                    delete botChannelIds[guildId];
                    // console.log(`Bot was removed from guild: (${guildId}). Cleared stored channel data: `, botChannelIds[guildId]);
                }

                botChannelIds[guildId] = channelId;
                // console.log("botChannelIds[guildId] = ", botChannelIds[guildId]);
                await interaction.reply('Channel Selected!');
            }

            // Set Reminders Command
            if (commandName === 'setreminders') {
                const options = ['7 Days Before', '5 Days Before', '3 Days Before', '1 Day Before'];
                const { customId, guildId } = interaction;

                // console.log("guildId = ", guildId);
                const value = customId;
                // const row = [];

                if (!guildReminderSelections[guildId]) {
                    guildReminderSelections[guildId] = [];
                }

                await interaction.reply({
                    content: 'Select your reminder options:',
                    components: getActionRows(guildReminderSelections[interaction.guildId]),
                });
            }

            // Add Project Command
            if(commandName === 'addproject'){
                const { customId, guildId } = interaction;

                if (!projectsAddedToServers[guildId]) {
                    projectsAddedToServers[guildId] = new Set();
                }
                
                const inviteLink = interaction.options.getString('invite_link');  // Collect the input value
                // projectsAddedToServers[guildId].add(inviteLink);

                const encodedInviteLink = encodeURIComponent(inviteLink);

                const response = await fetch(buildPath(`api/get-project-by-link/${encodedInviteLink}`), {
                    method: 'GET',
                });
                const project = await response.json();

                // console.log(project);
                projectsAddedToServers[guildId].add(project);


                // console.log("projectsAddedToServers[guildId]: ", projectsAddedToServers[guildId]);
                
                // https://ganttify-5b581a9c8167.herokuapp.com/join-project/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9qZWN0SWQiOiI2Nzk4M2ZhOTVmYzUzZDk4OWUwNWVlNDMiLCJpYXQiOjE3MzgwMzEwMTd9.BVhhsusXha82RqFF4q_zozuVMjd-t-XHtzfvr6GsEE0
                await interaction.reply({
                    content: 'Thank you, your project has been added!',
                });

            }
        } 
        // Interaction is a Button Interaction
        else if (interaction.isButton()) {
            const { customId, guildId } = interaction;

            if (!guildReminderSelections[guildId]) {
                guildReminderSelections[guildId] = [];
            }

            const value = customId;

            // Remove selection if already present
            if (guildReminderSelections[guildId].includes(value)) {
                guildReminderSelections[guildId] = guildReminderSelections[guildId].filter((v) => v !== value);
                await interaction.update({
                    content: `Your current selections: ${guildReminderSelections[guildId].join(', ') || 'None'}`,
                    components: getActionRows(guildReminderSelections[guildId]),
                });
            } 
            // Add selection if not present
            else {
                guildReminderSelections[guildId].push(value);
                await interaction.update({
                    content: `Your current selections: ${guildReminderSelections[guildId].join(', ') || 'None'}`,
                    components: getActionRows(guildReminderSelections[guildId]),
                });
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
    }
});

// Scheduled to check for tasks due every morning at 6am
// cron.schedule('0 6 * * *', async () => {  
cron.schedule('*/30 * * * * *', async () => {
    console.log("CRON.SCHEDULE...");
    // const index = 0;
    const currentDate = new Date();
    currentDate.setUTCHours(0, 0, 0, 0);

    const dayMark7 = new Date(currentDate);
    dayMark7.setDate(currentDate.getDate() + 7);
    dayMark7.setUTCHours(0, 0, 0, 0);

    const dayMark5 = new Date(currentDate);
    dayMark5.setDate(currentDate.getDate() + 5);
    dayMark5.setUTCHours(0, 0, 0, 0);

    const dayMark3 = new Date(currentDate);
    dayMark3.setDate(currentDate.getDate() + 3);
    dayMark3.setUTCHours(0, 0, 0, 0);

    const dayMark1 = new Date(currentDate);
    dayMark1.setDate(currentDate.getDate() + 1);
    dayMark1.setUTCHours(0, 0, 0, 0);

    // Runs through every server in order to sned reminders
    for (const guildId of botGuildIds) {
        const projects = [];

        const guildProjects = [...projectsAddedToServers[guildId]];

        projects.push(...guildProjects);

        // console.log(projects[index].tasks);

        // Runs through each project for all the projects added
        // to the specific guild/server
        for (const project of projects) {
            const tasksDueIn7Days = [];
            const tasksDueIn5Days = [];
            const tasksDueIn3Days = [];
            const tasksDueIn1Day = [];

            // console.log(project.tasks);

            const tasksArray = project.tasks;

            // console.log(tasksArray);

            const response = await fetch(buildPath(`api/getTasksById/${tasksArray}`), {
                method: 'GET',
            });

            const tasks = await response.json();

            // Gets all tasks for current project and inserts
            // them into their respective due date arrays
            for(const task of tasks) {
                const dueDate = new Date(task.dueDateTime);

                // console.log("dueDate: ", dueDate);
                // console.log("currentDate: ", currentDate);
                // console.log("dayMark7: ", dayMark7);

                if (dueDate.getTime() === dayMark7.getTime()) {
                    console.log("Task is due in 7 days...");
                    tasksDueIn7Days.push(task);
                }
                // if (dueDate.getTime() === dayMark5.getTime()) {
                //     console.log("Task is due in 5 days...");
                //     tasksDueIn5Days.push(task);
                // }
                // if (dueDate.getTime() === dayMark3.getTime()) {
                //     console.log("Task is due in 3 days...");
                //     tasksDueIn3Days.push(task);
                // }
                // if (dueDate.getTime() === dayMark1.getTime()) {
                //     console.log("Task is due in 1 days...");
                //     tasksDueIn1Day.push(task);
                // }
            }
            
            // Compose and send message to user for all of the
            // different task due date lengths

            const embed = new EmbedBuilder()
                .setDescription(`# 📢 **Daily Reminder**\n\n## Project: ${project.nameProject}`)
                // .setDescription(`# Project: ${project.nameProject}`)
                .setColor(0xFDDC87)
                .setFooter({ text: 'Have a great day!' })
                .setTimestamp();

                console.log("adding fields ");

                for (const task of tasksDueIn7Days) {
                    embed.addFields(
                        { 
                            name: `Task: ${task.taskTitle}`, 
                            value: (task.taskDescription === "") 
                                ? "No Task Description...\nDue in 7 days" 
                                : `${task.taskDescription}\nDue in 7 days`, 
                            inline: true 
                        }
                    );
                }
                

            // for(const task of tasksDueIn5Days){
            //     day5embed.addFields(
            //         { name: `Task: ${task.taskTitle}`, value: 'Due in 5 days', inline: true },
            //     );
            // }

            // for(const task of tasksDueIn3Days){
            //     day3embed.addFields(
            //         { name: `Task: ${task.taskTitle}`, value: 'Due in 3 days', inline: true },
            //     );
            // }

            // for(const task of tasksDueIn1Day){
            //     day1embed.addFields(
            //         { name: `Task: ${task.taskTitle}`, value: 'Due in 1 day', inline: true },
            //     );
            // }

            // console.log(tasksDueIn7Days);

            console.log("embed: ", embed);

            try{
                const guild = await client.guilds.fetch(guildId).catch(() => null);
                console.log("Guild: ", guild);
                console.log("botChannelIds[guildId]: ", botChannelIds[guildId]);
                const channel = await guild.channels.fetch(botChannelIds[guildId]).catch(() => null);
                // console.log("channel: ", channel);

                await channel.send({ embeds: [embed] });
                console.log(`Message sent to guild ${guildId} in channel ${botChannelIds[guildId]}`);
            }
            catch(error){
                console.error(`Failed to send message to guild ${guildId}:`, error);
            }
        }

        // index++;
    }
});

client.login(DISCORD_TOKEN);
keepAlive();
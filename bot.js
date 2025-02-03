require('dotenv').config();
const keepAlive = require('./server.js');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require('discord.js');
const { REST, Routes } = require('discord.js');
const { MongoClient, ObjectId } = require('mongodb');
const buildPath = require('./buildPath.js');
const cron = require('node-cron');

const { DISCORD_TOKEN, CLIENT_ID, MONGODB_URI, PORT } = process.env;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const guildReminderSelections = {};
const botGuildIds = new Set();
const projectsAddedToServers = {};

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
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async (interaction) => {
    try {
        // If the interaction is a slash command
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            if (commandName === 'ping') {
                await interaction.reply('Pong!');
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

                console.log(project);
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
cron.schedule('*/10 * * * * *', async () => {
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

    for (const guildId of botGuildIds) {
        const projects = [];

        const guildProjects = [...projectsAddedToServers[guildId]];

        projects.push(...guildProjects);

        // console.log(projects[index].tasks);

        for (const project of projects) {
            const tasksDueIn7Days = [];
            const tasksDueIn5Days = [];
            const tasksDueIn3Days = [];
            const tasksDueIn1Day = [];

            // console.log(project.tasks);

            const tasksArray = project.tasks;

            console.log(tasksArray);

            const response = await fetch(buildPath(`api/getTasksById/${tasksArray}`), {
                method: 'GET',
            });

            const tasks = await response.json();

            for(const task of tasks) {
                const dueDate = new Date(task.dueDateTime);

                console.log("dueDate: ", dueDate);
                console.log("currentDate: ", currentDate);
                console.log("dayMark7: ", dayMark7);

                if (dueDate.getTime() === dayMark7.getTime()) {
                    console.log("Task is due in 7 days...");
                    tasksDueIn7Days.push(task);
                }                
                if(){

                }
                if(){

                }
                if(){

                }
            }

            console.log(tasksDueIn7Days);
            
        }

        // index++;
    }
});

client.login(DISCORD_TOKEN);
keepAlive();
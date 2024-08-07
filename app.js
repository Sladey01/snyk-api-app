require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: true }));
app.set('view engine', 'ejs');

app.post('/set-credentials', (req, res) => {
    req.session.snykToken = req.body.snykToken;
    req.session.groupId = req.body.groupId;
    res.redirect('/home');
});

app.get('/', (req, res) => res.render('index'));

app.get('/home', (req, res) => res.render('home', { tokenSet: !!req.session.snykToken }));

app.get('/orgs', async (req, res) => {
    try {
        const response = await axios.get(`https://api.snyk.io/v1/group/${req.session.groupId}/orgs`, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });
        res.render('orgs', { orgs: response.data.orgs });
    } catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).send('Error fetching organizations');
    }
});

app.get('/orgs/:orgId/integrations', async (req, res) => {
    try {
        const response = await axios.get(`https://api.snyk.io/v1/org/${req.params.orgId}/integrations`, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });
        const integrations = Object.keys(response.data).map(key => {
            const integration = {
                name: key,
                id: response.data[key]
            };
            if (response.data[key].brokerToken) {
                integration.brokerToken = response.data[key].brokerToken;
            }
            return integration;
        });
        res.render('integrations', { orgId: req.params.orgId, integrations });
    } catch (error) {
        console.error('Failed to fetch integrations:', error);
        res.status(500).send('Error fetching integrations');
    }
});

app.post('/orgs/:orgId/integrations/:integrationId/provision-token', async (req, res) => {
    try {
        const response = await axios.post(`https://api.snyk.io/v1/org/${req.params.orgId}/integrations/${req.params.integrationId}/authentication/provision-token`, {}, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error creating provisional token:', error.response ? error.response.data : error.message);
        res.status(500).send('Failed to create provisional token');
    }
});

app.post('/orgs/:orgId/integrations/:integrationId/switch-token', async (req, res) => {
    const provisionalToken = req.body.provisionalToken;
    try {
        await axios.post(`https://api.snyk.io/v1/org/${req.params.orgId}/integrations/${req.params.integrationId}/authentication/switch-token`, {
            token: provisionalToken
        }, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });
        res.send('Token switched successfully');
    } catch (error) {
        console.error('Error switching token:', error.response ? error.response.data : error.message);
        res.status(500).send('Failed to switch token');
    }
});

app.get('/notifications', async (req, res) => {
    try {
        const orgResponse = await axios.get(`https://api.snyk.io/v1/group/${req.session.groupId}/orgs`, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });

        const orgs = orgResponse.data.orgs;
        const orgSettingsPromises = orgs.map(async (org) => {
            const settingsResponse = await axios.get(`https://api.snyk.io/v1/org/${org.id}/notification-settings`, {
                headers: { 'Authorization': `token ${req.session.snykToken}` }
            });
            return {
                id: org.id,
                name: org.name,
                settings: settingsResponse.data
            };
        });

        const orgsWithSettings = await Promise.all(orgSettingsPromises);

        res.render('notifications', { orgs: orgsWithSettings });
    } catch (error) {
        console.error('Error fetching organizations or settings:', error);
        res.status(500).send('Error fetching organizations or settings');
    }
});

app.get('/notifications/:orgId/settings', async (req, res) => {
    const orgId = req.params.orgId;
    try {
        const settingsResponse = await axios.get(`https://api.snyk.io/v1/org/${orgId}/notification-settings`, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });
        res.json({ settings: settingsResponse.data });
    } catch (error) {
        console.error('Error fetching notification settings:', error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching notification settings');
    }
});

app.post('/notifications/disable', async (req, res) => {
    const orgId = req.body.orgId;
    try {
        await axios.put(`https://api.snyk.io/v1/org/${orgId}/notification-settings`, {
            "new-issues-remediations": { "enabled": false, "issueSeverity": "high", "issueType": "all" },
            "weekly-report": { "enabled": false },
            "test-limit": { "enabled": false },
            "project-imported": { "enabled": false }
        }, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });
        res.send('Notifications disabled for organization ' + orgId);
    } catch (error) {
        console.error('Error disabling notifications:', error.response.data);
        res.status(500).send('Error disabling notifications for organization');
    }
});

app.post('/notifications/enable', async (req, res) => {
    const orgId = req.body.orgId;
    try {
        await axios.put(`https://api.snyk.io/v1/org/${orgId}/notification-settings`, {
            "new-issues-remediations": { "enabled": true, "issueSeverity": "high", "issueType": "all" },
            "weekly-report": { "enabled": true },
            "test-limit": { "enabled": true },
            "project-imported": { "enabled": true }
        }, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });
        res.send('Notifications enabled for organization ' + orgId);
    } catch (error) {
        console.error('Error enabling notifications:', error.response.data);
        res.status(500).send('Error enabling notifications for organization');
    }
});

app.post('/notifications/disable-all', async (req, res) => {
    try {
        const response = await axios.get(`https://api.snyk.io/v1/group/${req.session.groupId}/orgs`, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });
        const disablePromises = response.data.orgs.map(org =>
            axios.put(`https://api.snyk.io/v1/org/${org.id}/notification-settings`, {
                "new-issues-remediations": { "enabled": false, "issueSeverity": "high", "issueType": "all" },
                "weekly-report": { "enabled": false },
                "test-limit": { "enabled": false },
                "project-imported": { "enabled": false }
            }, {
                headers: { 'Authorization': `token ${req.session.snykToken}` }
            })
        );
        await Promise.all(disablePromises);
        res.send('Notifications disabled for all organizations');
    } catch (error) {
        console.error('Error disabling notifications for all organizations:', error.response.data);
        res.status(500).send('Error disabling notifications for all organizations');
    }
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

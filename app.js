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
    // Remove the line setting orgId from testtest the form
    // req.session.orgId = req.body.orgId;
    res.redirect('/home');
});

app.get('/', (req, res) => res.render('index'));

app.get('/home', (req, res) => res.render('home', { tokenSet: !!req.session.snykToken }));

app.get('/orgs', async (req, res) => {
    try {
        const response = await axios.get(`https://api.snyk.io/v1/group/${req.session.groupId}/orgs`, { headers: { 'Authorization': `token ${req.session.snykToken}` } });
        res.render('orgs', { orgs: response.data.orgs });
    } catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).send('Error fetching organizations');
    }
});

app.get('/orgs/:orgId/integrations', async (req, res) => {
    try {
        const response = await axios.get(`https://api.snyk.io/v1/org/${req.params.orgId}/integrations`, { headers: { 'Authorization': `token ${req.session.snykToken}` } });
        const integrations = Object.keys(response.data).map(key => {
            const integration = {
                name: key,
                id: response.data[key]
            };

            // Fetch the broker token if it exists for the integration
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


app.get('/orgs/other-with-integration/:integrationName', async (req, res) => {
    try {
        const groupId = req.session.groupId;
        const integrationName = req.params.integrationName;
        const orgsResponse = await axios.get(`https://api.snyk.io/v1/group/${groupId}/orgs`, { headers: { 'Authorization': `token ${req.session.snykToken}` } });
        const allOrgs = orgsResponse.data.orgs;

        const orgsWithIntegration = [];

        for (const org of allOrgs) {
            const integrationsResponse = await axios.get(`https://api.snyk.io/v1/org/${org.id}/integrations`, { headers: { 'Authorization': `token ${req.session.snykToken}` } });
            const integrations = Object.keys(integrationsResponse.data);

            if (integrations.includes(integrationName)) {
                orgsWithIntegration.push({ name: org.name, id: org.id });
            }
        }

        res.json({ orgs: orgsWithIntegration });
    } catch (error) {
        console.error('Error fetching organizations with the same integration:', error);
        res.status(500).send('Error fetching organizations');
    }
});

app.get('/brokers', async (req, res) => {
    try {
        const response = await axios.get(`https://api.snyk.io/v1/org/${req.session.orgId}/integrations`, {
            headers: { 'Authorization': `token ${req.session.snykToken}` }
        });
        const brokers = response.data;
        res.render('brokers', { brokers });
    } catch (error) {
        console.error('Error fetching brokers:', error);
        res.status(500).send('Error fetching brokers');
    }
});

app.post('/orgs/:orgId/integrations/:integrationId/provision-token', async (req, res) => {
    try {
        const response = await axios.post(`https://snyk.io/api/v1/org/${req.params.orgId}/integrations/${req.params.integrationId}/authentication/provision-token`, {}, { headers: { 'Authorization': `token ${req.session.snykToken}` } });
        res.json({ token: response.data.provisionalBrokerToken });
    } catch (error) {
        console.error('Error creating provisional broker token:', error);
        res.status(500).json({ message: 'Error creating provisional broker token' });
    }
});

app.post('/orgs/:orgId/integrations/:integrationId/switch-token', async (req, res) => {
    try {
        await axios.post(`https://snyk.io/api/v1/org/${req.params.orgId}/integrations/${req.params.integrationId}/authentication/switch-token`, { token: req.body.newToken }, { headers: { 'Authorization': `token ${req.session.snykToken}` } });
        res.send({ message: 'Token switched successfully' });
    } catch (error) {
        console.error('Error switching token:', error);
        res.status(500).send('Failed to switch token');
    }
});

app.post('/brokers/provision-token', async (req, res) => {
    try {
        const response = await axios.post(`https://snyk.io/api/v1/org/${req.session.orgId}/integrations/${req.body.brokerId}/authentication/provision-token`, {}, { headers: { 'Authorization': `token ${req.session.snykToken}` } });
        res.json({ token: response.data.provisionalBrokerToken });
    } catch (error) {
        console.error('Error provisioning broker token:', error);
        res.status(500).json({ message: 'Error provisioning broker token' });
    }
});

app.post('/brokers/switch-token', async (req, res) => {
    try {
        await axios.post(`https://snyk.io/api/v1/org/${req.session.orgId}/integrations/${req.body.brokerId}/authentication/switch-token`, { token: req.body.newToken }, { headers: { 'Authorization': `token ${req.session.snykToken}` } });
        res.send({ message: 'Broker token switched successfully' });
    } catch (error) {
        console.error('Error switching broker token:', error);
        res.status(500).send('Failed to switch broker token');
    }
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

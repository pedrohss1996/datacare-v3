/**
 * Controller de páginas - Renderiza views EJS do ai-dashboard
 */
function aiDatasetsPage(req, res) {
  res.redirect('/ai-dashboards');
}

function aiDashboardsPage(req, res) {
  res.render('pages/ai-dashboard/unified', {
    title: 'Dashboards & Dados - DataCare',
    layout: 'layouts/main',
    user: req.user || null,
  });
}

function aiDashboardViewPage(req, res) {
  res.render('pages/ai-dashboard/view', {
    title: 'Dashboard - DataCare',
    layout: 'layouts/main',
    user: req.user || null,
    dashboardId: req.params.id,
  });
}

function aiColorScalesPage(req, res) {
  res.render('pages/ai-dashboard/color-scales', {
    title: 'Escalas de cor - DataCare',
    layout: 'layouts/main',
    user: req.user || null,
  });
}

module.exports = { aiDatasetsPage, aiDashboardsPage, aiDashboardViewPage, aiColorScalesPage };

export default {
    app: {
        name: 'Planspielplatte',
        subtitle: 'Lagekarte für Planspiele',
    },
    nav: {
        landing: 'Start',
        help: 'Hilfe',
    },
    routes: {
        board: 'Platte',
        symbols: 'Taktische Zeichen',
        notFound: 'Nicht gefunden',
    },
    symbols: {
        title: 'Taktische Zeichen',
        intro: 'Alle Fahrzeugtypen einer Region mit ihrem Zeichen, dazu die Zeichen für abgesessene Trupps und für Einsatzstellen. Die Zahl hinter dem Namen ist die Kennzahl im Funkrufnamen, wo die Region eine festlegt.',
        region: 'Region',
        types: 'Fahrzeugtypen ({count})',
        crew: 'Besatzung {strength}',
        squads: 'Trupps und Funktionen',
        marks: 'Einsatzstellen und Orte',
    },
    categories: {
        'engine': 'Löschfahrzeuge',
        'aerial': 'Hubrettung',
        'command': 'Führung',
        'medical': 'Rettungsdienst und Sanität',
        'technical': 'Rüst- und Technik',
        'hazmat': 'Gefahrgut und CBRN',
        'logistics': 'Logistik und Transport',
        'swap-body': 'Wechsellader und Abrollbehälter',
        'water': 'Wasserrettung',
        'other': 'Sonstige',
    },
    marks: {
        'incident': 'Schadensstelle',
        'fire': 'Brand',
        'hazard': 'Gefahr',
        'staging': 'Bereitstellungsraum',
        'command-post': 'Einsatzleitung',
        'water': 'Wasserentnahmestelle',
        'casualty-collection': 'Verletztensammelstelle',
    },
    notFound: {
        title: 'Diese Seite gibt es nicht.',
        back: 'Zur Startseite',
    },
}

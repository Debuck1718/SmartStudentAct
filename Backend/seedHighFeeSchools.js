require('dotenv').config();
const mongoose = require('mongoose');
const School = require('./models/School');

const highFeeSchools = [
  // Angola (AO)
  { schoolName: 'Luanda International School', schoolCountry: 'AO', tier: 3 },
  { schoolName: 'Angola International School', schoolCountry: 'AO', tier: 3 },

  // Botswana (BW)
  { schoolName: 'Westwood International School', schoolCountry: 'BW', tier: 3 },

  // Cameroon (CM)
  { schoolName: 'American School of Yaoundé', schoolCountry: 'CM', tier: 3 },
  { schoolName: 'ENKO La Gaiete International School', schoolCountry: 'CM', tier: 3 },
  { schoolName: 'Rainforest International School', schoolCountry: 'CM', tier: 3 },

  // Democratic Republic of Congo (CD)
  { schoolName: 'American School of Kinshasa (TASOK)', schoolCountry: 'CD', tier: 3 },

  // Egypt (EG)
  { schoolName: 'Cairo American College', schoolCountry: 'EG', tier: 3 },
  { schoolName: 'New Cairo British International School', schoolCountry: 'EG', tier: 3 },
  { schoolName: 'Schutz American School', schoolCountry: 'EG', tier: 3 },
  { schoolName: 'Malvern College Egypt', schoolCountry: 'EG', tier: 3 },
  { schoolName: 'Canadian International School of Egypt', schoolCountry: 'EG', tier: 3 },
  { schoolName: 'International School of Choueifat', schoolCountry: 'EG', tier: 3 },
  { schoolName: 'British International College in Cairo', schoolCountry: 'EG', tier: 3 },

  // Ethiopia (ET)
  { schoolName: 'International Community School Addis Ababa', schoolCountry: 'ET', tier: 3 },
  { schoolName: 'Sandford International School', schoolCountry: 'ET', tier: 3 },
  { schoolName: 'Bingham Academy', schoolCountry: 'ET', tier: 3 },
  { schoolName: 'German Embassy School Addis Ababa', schoolCountry: 'ET', tier: 3 },

  // Ghana (GH)
  { schoolName: 'American International School, Ghana', schoolCountry: 'GH', tier: 3 },
  { schoolName: 'British International School of Accra', schoolCountry: 'GH', tier: 3 },
  { schoolName: 'The Roman Ridge School', schoolCountry: 'GH', tier: 3 },
  { schoolName: 'Galaxy International School', schoolCountry: 'GH', tier: 3 },
  { schoolName: 'SOS Herman Gmeiner International College', schoolCountry: 'GH', tier: 3 },
  { schoolName: 'Liberty American School', schoolCountry: 'GH', tier: 3 },
  { schoolName: 'DPS International Ghana', schoolCountry: 'GH', tier: 3 },
  { schoolName: 'Ghana International School', schoolCountry: 'GH', tier: 3 },
  { schoolName: 'Lincoln Community School', schoolCountry: 'GH', tier: 3 },

  // Ivory Coast (CI)
  { schoolName: 'International Community School of Abidjan', schoolCountry: 'CI', tier: 3 },

  // Kenya (KE)
  { schoolName: 'International School of Kenya', schoolCountry: 'KE', tier: 3 },
  { schoolName: 'Brookhouse School', schoolCountry: 'KE', tier: 3 },
  { schoolName: "St Andrew's School, Turi", schoolCountry: 'KE', tier: 3 },
  { schoolName: 'Greensteds International School', schoolCountry: 'KE', tier: 3 },
  { schoolName: 'Peponi School', schoolCountry: 'KE', tier: 3 },
  { schoolName: 'The Banda School', schoolCountry: 'KE', tier: 3 },
  { schoolName: 'Hillcrest International School', schoolCountry: 'KE', tier: 3 },
  { schoolName: 'Braeburn School', schoolCountry: 'KE', tier: 3 },
  { schoolName: 'Woodland Star International School', schoolCountry: 'KE', tier: 3 },
  { schoolName: 'Rosslyn Academy', schoolCountry: 'KE', tier: 3 },
  { schoolName: 'German School Nairobi', schoolCountry: 'KE', tier: 3 },

  // Morocco (MA)
  { schoolName: 'George Washington Academy', schoolCountry: 'MA', tier: 3 },
  { schoolName: 'Rabat American School', schoolCountry: 'MA', tier: 3 },
  { schoolName: 'Lycée Lyautey', schoolCountry: 'MA', tier: 3 },
  { schoolName: 'American School of Marrakech', schoolCountry: 'MA', tier: 3 },
  { schoolName: 'American School of Tangier', schoolCountry: 'MA', tier: 3 },
  { schoolName: 'Ecole Al Jabr', schoolCountry: 'MA', tier: 3 },
  { schoolName: 'British International School Casablanca', schoolCountry: 'MA', tier: 3 },

  // Mozambique (MZ)
  { schoolName: 'International School of Mozambique', schoolCountry: 'MZ', tier: 3 },
  { schoolName: 'Maputo International School', schoolCountry: 'MZ', tier: 3 },
  { schoolName: 'Chimoio International School', schoolCountry: 'MZ', tier: 3 },
  { schoolName: 'Willow International School-Maputo', schoolCountry: 'MZ', tier: 3 },

  // Namibia (NA)
  { schoolName: 'Windhoek International School', schoolCountry: 'NA', tier: 3 },

  // Nigeria (NG)
  { schoolName: 'American International School of Lagos', schoolCountry: 'NG', tier: 3 },
  { schoolName: 'British International School, Lagos', schoolCountry: 'NG', tier: 3 },
  { schoolName: 'Lekki British International School', schoolCountry: 'NG', tier: 3 },
  { schoolName: 'Grange School', schoolCountry: 'NG', tier: 3 },
  { schoolName: 'Day Waterman College', schoolCountry: 'NG', tier: 3 },
  { schoolName: 'Greensprings School', schoolCountry: 'NG', tier: 3 },
  { schoolName: 'Charterhouse Lagos', schoolCountry: 'NG', tier: 3 },

  // Rwanda (RW)
  { schoolName: 'International School of Kigali', schoolCountry: 'RW', tier: 3 },

  // Senegal (SN)
  { schoolName: 'International School of Dakar', schoolCountry: 'SN', tier: 3 },

  // South Africa (ZA)
  { schoolName: 'American International School of Johannesburg', schoolCountry: 'ZA', tier: 3 },
  { schoolName: 'Hilton College', schoolCountry: 'ZA', tier: 3 },
  { schoolName: 'Michaelhouse', schoolCountry: 'ZA', tier: 3 },
  { schoolName: 'St Andrew\'s College Grahamstown', schoolCountry: 'ZA', tier: 3 },
  { schoolName: 'Roedean School for Girls', schoolCountry: 'ZA', tier: 3 },
  { schoolName: 'St John\'s College', schoolCountry: 'ZA', tier: 3 },
  { schoolName: 'Kearsney College', schoolCountry: 'ZA', tier: 3 },
  { schoolName: 'Bishops Diocesan College', schoolCountry: 'ZA', tier: 3 },

  // Tanzania (TZ)
  { schoolName: 'International School of Tanganyika', schoolCountry: 'TZ', tier: 3 },
  { schoolName: 'Braeburn International School Dar es Salaam', schoolCountry: 'TZ', tier: 3 },
  { schoolName: 'Dar es Salaam International Academy', schoolCountry: 'TZ', tier: 3 },
  { schoolName: 'Iringa International School', schoolCountry: 'TZ', tier: 3 },
  { schoolName: 'Haven of Peace Academy', schoolCountry: 'TZ', tier: 3 },
  { schoolName: 'Morogoro International School', schoolCountry: 'TZ', tier: 3 },
  { schoolName: 'St. Constantine\'s International School', schoolCountry: 'TZ', tier: 3 },

  // Tunisia (TN)
  { schoolName: 'American Cooperative School of Tunis', schoolCountry: 'TN', tier: 3 },
  { schoolName: 'British International School of Tunis', schoolCountry: 'TN', tier: 3 },
  { schoolName: 'Lycée Gustave Flaubert', schoolCountry: 'TN', tier: 3 },
  { schoolName: 'École Internationale de Carthage', schoolCountry: 'TN', tier: 3 },
  { schoolName: 'American Academy of Tunis', schoolCountry: 'TN', tier: 3 },
  { schoolName: 'International School of Carthage', schoolCountry: 'TN', tier: 3 },
  { schoolName: 'British School of Carthage', schoolCountry: 'TN', tier: 3 },

  // Uganda (UG)
  { schoolName: 'Kampala International School', schoolCountry: 'UG', tier: 3 },
  { schoolName: 'International School of Uganda (ISU)', schoolCountry: 'UG', tier: 3 },
  { schoolName: 'Ambrosoli International School', schoolCountry: 'UG', tier: 3 },
  { schoolName: 'Rainbow International School Uganda (RISU)', schoolCountry: 'UG', tier: 3 },

  // Zambia (ZM)
  { schoolName: 'Lusaka International Community School', schoolCountry: 'ZM', tier: 3 },
  { schoolName: 'American International School of Lusaka', schoolCountry: 'ZM', tier: 3 },

  // Zimbabwe (ZW)
  { schoolName: 'Harare International School', schoolCountry: 'ZW', tier: 3 },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Drop old indexes on name/country if they exist
    const indexes = await School.collection.indexes();
    for (const idx of indexes) {
      if (idx.key.name || idx.key.country) {
        await School.collection.dropIndex(idx.name);
        console.log(`Dropped old index: ${idx.name}`);
      }
    }

    // Optional: remove all old documents
    await School.deleteMany({});

    // Insert new documents
    await School.insertMany(highFeeSchools);

    // Ensure unique index on new field
    await School.collection.createIndex({ schoolName: 1 }, { unique: true });

    console.log('✅ High fee schools inserted successfully');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();




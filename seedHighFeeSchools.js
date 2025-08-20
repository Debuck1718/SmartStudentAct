require('dotenv').config();
const mongoose = require('mongoose');
const School = require('./models/School');

const highFeeSchools = [
  // Angola (AO)
  { name: 'Luanda International School', country: 'AO', tier: 3 },
  { name: 'Angola International School', country: 'AO', tier: 3 },

  // Botswana (BW)
  { name: 'Westwood International School', country: 'BW', tier: 3 },

  // Cameroon (CM)
  { name: 'American School of Yaoundé', country: 'CM', tier: 3 },
  { name: 'ENKO La Gaiete International School', country: 'CM', tier: 3 },
  { name: 'Rainforest International School', country: 'CM', tier: 3 },

  // Democratic Republic of Congo (CD)
  { name: 'American School of Kinshasa (TASOK)', country: 'CD', tier: 3 },

  // Egypt (EG)
  { name: 'Cairo American College', country: 'EG', tier: 3 },
  { name: 'New Cairo British International School', country: 'EG', tier: 3 },
  { name: 'Schutz American School', country: 'EG', tier: 3 },
  { name: 'Malvern College Egypt', country: 'EG', tier: 3 },
  { name: 'Canadian International School of Egypt', country: 'EG', tier: 3 },
  { name: 'International School of Choueifat', country: 'EG', tier: 3 },
  { name: 'British International College in Cairo', country: 'EG', tier: 3 },

  // Ethiopia (ET)
  { name: 'International Community School Addis Ababa', country: 'ET', tier: 3 },
  { name: 'Sandford International School', country: 'ET', tier: 3 },
  { name: 'Bingham Academy', country: 'ET', tier: 3 },
  { name: 'German Embassy School Addis Ababa', country: 'ET', tier: 3 },

  // Ghana (GH)
  { name: 'American International School, Ghana', country: 'GH', tier: 3 },
  { name: 'British International School of Accra', country: 'GH', tier: 3 },
  { name: 'The Roman Ridge School', country: 'GH', tier: 3 },
  { name: 'Galaxy International School', country: 'GH', tier: 3 },
  { name: 'SOS Herman Gmeiner International College', country: 'GH', tier: 3 },
  { name: 'Liberty American School', country: 'GH', tier: 3 },
  { name: 'DPS International Ghana', country: 'GH', tier: 3 },
  { name: 'Ghana International School', country: 'GH', tier: 3 },
  { name: 'Lincoln Community School', country: 'GH', tier: 3 },

  // Ivory Coast (CI)
  { name: 'International Community School of Abidjan', country: 'CI', tier: 3 },

  // Kenya (KE)
  { name: 'International School of Kenya', country: 'KE', tier: 3 },
  { name: 'Brookhouse School', country: 'KE', tier: 3 },
  { name: 'St Andrew\'s School, Turi', country: 'KE', tier: 3 },
  { name: 'Greensteds International School', country: 'KE', tier: 3 },
  { name: 'Peponi School', country: 'KE', tier: 3 },
  { name: 'The Banda School', country: 'KE', tier: 3 },
  { name: 'Hillcrest International School', country: 'KE', tier: 3 },
  { name: 'Braeburn School', country: 'KE', tier: 3 },
  { name: 'Woodland Star International School', country: 'KE', tier: 3 },
  { name: 'Rosslyn Academy', country: 'KE', tier: 3 },
  { name: 'German School Nairobi', country: 'KE', tier: 3 },

  // Morocco (MA)
  { name: 'George Washington Academy', country: 'MA', tier: 3 },
  { name: 'Rabat American School', country: 'MA', tier: 3 },
  { name: 'Lycée Lyautey', country: 'MA', tier: 3 },
  { name: 'American School of Marrakech', country: 'MA', tier: 3 },
  { name: 'American School of Tangier', country: 'MA', tier: 3 },
  { name: 'Ecole Al Jabr', country: 'MA', tier: 3 },
  { name: 'British International School Casablanca', country: 'MA', tier: 3 },

  // Mozambique (MZ)
  { name: 'International School of Mozambique', country: 'MZ', tier: 3 },
  { name: 'Maputo International School', country: 'MZ', tier: 3 },
  { name: 'Chimoio International School', country: 'MZ', tier: 3 },
  { name: 'Willow International School-Maputo', country: 'MZ', tier: 3 },

  // Namibia (NA)
  { name: 'Windhoek International School', country: 'NA', tier: 3 },

  // Nigeria (NG)
  { name: 'American International School of Lagos', country: 'NG', tier: 3 },
  { name: 'British International School, Lagos', country: 'NG', tier: 3 },
  { name: 'Lekki British International School', country: 'NG', tier: 3 },
  { name: 'Grange School', country: 'NG', tier: 3 },
  { name: 'Day Waterman College', country: 'NG', tier: 3 },
  { name: 'Greensprings School', country: 'NG', tier: 3 },
  { name: 'Charterhouse Lagos', country: 'NG', tier: 3 },

  // Rwanda (RW)
  { name: 'International School of Kigali', country: 'RW', tier: 3 },

  // Senegal (SN)
  { name: 'International School of Dakar', country: 'SN', tier: 3 },

  // South Africa (ZA)
  { name: 'American International School of Johannesburg', country: 'ZA', tier: 3 },
  { name: 'Hilton College', country: 'ZA', tier: 3 },
  { name: 'Michaelhouse', country: 'ZA', tier: 3 },
  { name: 'St Andrew\'s College Grahamstown', country: 'ZA', tier: 3 },
  { name: 'Roedean School for Girls', country: 'ZA', tier: 3 },
  { name: 'St John\'s College', country: 'ZA', tier: 3 },
  { name: 'Kearsney College', country: 'ZA', tier: 3 },
  { name: 'Bishops Diocesan College', country: 'ZA', tier: 3 },

  // Tanzania (TZ)
  { name: 'International School of Tanganyika', country: 'TZ', tier: 3 },
  { name: 'Braeburn International School Dar es Salaam', country: 'TZ', tier: 3 },
  { name: 'Dar es Salaam International Academy', country: 'TZ', tier: 3 },
  { name: 'Iringa International School', country: 'TZ', tier: 3 },
  { name: 'Haven of Peace Academy', country: 'TZ', tier: 3 },
  { name: 'Morogoro International School', country: 'TZ', tier: 3 },
  { name: 'St. Constantine\'s International School', country: 'TZ', tier: 3 },

  // Tunisia (TN)
  { name: 'American Cooperative School of Tunis', country: 'TN', tier: 3 },
  { name: 'British International School of Tunis', country: 'TN', tier: 3 },
  { name: 'Lycée Gustave Flaubert', country: 'TN', tier: 3 },
  { name: 'École Internationale de Carthage', country: 'TN', tier: 3 },
  { name: 'American Academy of Tunis', country: 'TN', tier: 3 },
  { name: 'International School of Carthage', country: 'TN', tier: 3 },
  { name: 'British School of Carthage', country: 'TN', tier: 3 },

  // Uganda (UG)
  { name: 'Kampala International School', country: 'UG', tier: 3 },
  { name: 'International School of Uganda (ISU)', country: 'UG', tier: 3 },
  { name: 'Ambrosoli International School', country: 'UG', tier: 3 },
  { name: 'Rainbow International School Uganda (RISU)', country: 'UG', tier: 3 },

  // Zambia (ZM)
  { name: 'Lusaka International Community School', country: 'ZM', tier: 3 },
  { name: 'American International School of Lusaka', country: 'ZM', tier: 3 },

  // Zimbabwe (ZW)
  { name: 'Harare International School', country: 'ZW', tier: 3 },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await School.insertMany(highFeeSchools);
    console.log('✅ High fee schools inserted successfully');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

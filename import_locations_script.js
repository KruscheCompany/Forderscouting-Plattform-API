const fetch = require('node-fetch');
const mainObject = {
  "Amt Eiderstedt": [
    "Sankt Peter-Ording",
    "Tetenbüll",
    "Tümlauer-Koog",
    "Poppenbüll",
    "Garding",
    "Oldenswort",
    "Vollerwiek",
    "Welt",
    "Tating",
    "Osterhever",
    "Norderfriedrichskoog",
    "Kotzenbüll",
    "Katharinenheerd",
    "Grothusenkoog",
    "Garding Kirchspiel",
    "Kirchspiel, Garding",
    "Grothusenkoog",
    "Katharineheerd",
    "Westerhever"
  ],
  "Amt Föhr-Amrum": [
    "Wittdün",
    "Norddorf",
    "Oevenum",
    "Wrixum",
    "Wyk auf Föhr",
    "Midlum",
    "Borgsum",
    "Dunsum",
    "Nieblum",
    "Oldsum",
    "Süderende",
    "Alkersum",
    "Utersum",
    "Witsum"
  ],
  "Amt Landschaft Sylt": [
    "Wenningstedt-Braderup",
    "List",
    "Hörnum",
    "Kampen",
    "Sylt"
  ],
  "Amt Mittleres Nordfriesland": [
    "Bredstedt",
    "Lütjenholm",
    "Struckum",
    "Ahrenshöft",
    "Bargum",
    "Bohmstedt",
    "Bordelum",
    "Breklum",
    "Drelsdorf",
    "Goldebek",
    "Goldelund",
    "Högel",
    "Joldelund",
    "Kolkerheide",
    "Langenhorn",
    "Ockholm",
    "Sönnebüll",
    "Vollstedt",
    "Reußenköge",
    "Almdorf",
    "Reußenköge",
    "Vollstedt"
  ],
  "Amt Nordsee-Treene": [
    "Nordstrand",
    "Hattstedt",
    "Schwabstedt",
    "Süderhöft",
    "Witzwort",
    "Winnert",
    "Wobbenbüll",
    "Elisabeth-Sophien-Koog",
    "Fresendelf",
    "Hude",
    "Koldenbüttel",
    "Mildstedt",
    "Olderup",
    "Ostenfeld",
    "Ramstedt",
    "Rantrum",
    "Seeth",
    "Simonsberg",
    "Südermarsch",
    "Arlewatt",
    "Drage",
    "Horstedt",
    "Oldersbek",
    "Uelvesbüll",
    "Wisch",
    "Hattstedtermarsch",
    "Friedrichstadt",
    "Hattstedtermarsch",
    "Uelvesbüll",
    "Wisch",
    "Wittbek"
  ],
  "Amt Pellworm": [
    "Pellworm",
    "Gröde",
    "Hooge",
    "Langeneß"
  ],
  "Amt Südtondern": [
    "Niebüll",
    "Braderup",
    "Dagebüll",
    "Stedesand",
    "Bosbüll",
    "Stadum",
    "Leck",
    "Achtrup",
    "Aventoft",
    "Humptrup",
    "Karlum",
    "Klanxbüll",
    "Klixbüll",
    "Ladelund",
    "Neukirchen",
    "Niebüll",
    "Risum-Lindholm",
    "Rodenäs",
    "Sprakebüll",
    "Stadum",
    "Stedesand",
    "Süderlügum",
    "Tinningstedt",
    "Uphusum",
    "Westre",
    "Bramstedtlund",
    "Ellhöft",
    "Emmelsbüll-Horsbüll",
    "Enge-Sande",
    "Friedrich-Wilhelm-Lübke-Koog",
    "Galmsbüll",
    "Holm",
    "Lexgaard"
  ],
  "Amt Viöl": [
    "Ahrenviöl",
    "Ahrenviölfeld",
    "Behrendorf",
    "Bondelum",
    "Haselund",
    "Immenstedt",
    "Löwenstedt",
    "Norstedt",
    "Oster-Ohrstedt",
    "Schwesing",
    "Sollwitt",
    "Viöl",
    "Wester-Ohrstedt"
  ],
  "Stadt Husum": [
    "Husum"

  ],
  "Stadt Tönning": [
    "Tönning"
  ],
  "Gemeinde Sylt/Amt Landschaft Sylt": [
    "Sylt"
  ],
  "All": [
    "Sankt Peter-Ording",
    "Tetenbüll",
    "Tümlauer-Koog",
    "Poppenbüll",
    "Garding",
    "Oldenswort",
    "Vollerwiek",
    "Welt",
    "Tating",
    "Osterhever",
    "Norderfriedrichskoog",
    "Kotzenbüll",
    "Katharinenheerd",
    "Grothusenkoog",
    "Garding Kirchspiel",
    "Wittdün",
    "Norddorf",
    "Oevenum",
    "Wrixum",
    "Wyk auf Föhr",
    "Midlum",
    "Borgsum",
    "Dunsum",
    "Nieblum",
    "Oldsum",
    "Süderende",
    "Alkersum",
    "Utersum",
    "Witsum",
    "Wenningstedt-Braderup",
    "List",
    "Hörnum",
    "Kampen",
    "Sylt",
    "Bredstedt",
    "Lütjenholm",
    "Struckum",
    "Ahrenshöft",
    "Bargum",
    "Bohmstedt",
    "Bordelum",
    "Breklum",
    "Drelsdorf",
    "Goldebek",
    "Goldelund",
    "Högel",
    "Joldelund",
    "Kolkerheide",
    "Langenhorn",
    "Ockholm",
    "Sönnebüll",
    "Vollstedt",
    "Reußenköge",
    "Nordstrand",
    "Hattstedt",
    "Schwabstedt",
    "Süderhöft",
    "Witzwort",
    "Winnert",
    "Wobbenbüll",
    "Elisabeth-Sophien-Koog",
    "Fresendelf",
    "Hude",
    "Koldenbüttel",
    "Mildstedt",
    "Olderup",
    "Ostenfeld",
    "Ramstedt",
    "Rantrum",
    "Seeth",
    "Simonsberg",
    "Südermarsch",
    "Arlewatt",
    "Drage",
    "Horstedt",
    "Oldersbek",
    "Uelvesbüll",
    "Wisch",
    "Hattstedtermarsch",
    "Pellworm",
    "Gröde",
    "Hooge",
    "Langeneß",
    "Niebüll",
    "Braderup",
    "Dagebüll",
    "Stedesand",
    "Bosbüll",
    "Stadum",
    "Leck",
    "Achtrup",
    "Aventoft",
    "Humptrup",
    "Karlum",
    "Klanxbüll",
    "Klixbüll",
    "Ladelund",
    "Neukirchen",
    "Niebüll",
    "Risum-Lindholm",
    "Rodenäs",
    "Sprakebüll",
    "Stadum",
    "Stedesand",
    "Süderlügum",
    "Tinningstedt",
    "Uphusum",
    "Westre",
    "Ahrenviöl",
    "Ahrenviölfeld",
    "Behrendorf",
    "Bondelum",
    "Haselund",
    "Immenstedt",
    "Löwenstedt",
    "Norstedt",
    "Oster-Ohrstedt",
    "Schwesing",
    "Sollwitt",
    "Viöl",
    "Wester-Ohrstedt",
    "Husum",
    "Tönning",
    "Sylt",
    "Kirchspiel, Garding",
    "Grothusenkoog",
    "Katharineheerd",
    "Westerhever",
    "Almdorf",
    "Reußenköge",
    "Vollstedt",
    "Friedrichstadt",
    "Hattstedtermarsch",
    "Uelvesbüll",
    "Wisch",
    "Wittbek",
    "Bramstedtlund",
    "Ellhöft",
    "Emmelsbüll-Horsbüll",
    "Enge-Sande",
    "Friedrich-Wilhelm-Lübke-Koog",
    "Galmsbüll",
    "Holm",
    "Lexgaard"
  ]
};
const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNzIxMjI3NDUxLCJleHAiOjE3MjM4MTk0NTF9.Ap3n4HXqy0CtH4UP8dodjewSz6a17U909SjXKE4CEYA';

async function fetchData(url) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch data from ${url}`);
  }
  return response.json();
}

async function postData(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(data)
  });
  console.log("🚀 ~ postData ~ response:", response)
  if (!response.ok) {
    throw new Error(`Failed to post data to ${url}`);
  }
  return response.json();
}

async function processMainObject(mainObject) {
  for (const key of Object.keys(mainObject)) {
    try {
      // Step 3: Fetch municipality ID
      const municipalities = await fetchData('https://api.foerderscouting-plattform.de/api/municipalities');
      const municipality = municipalities.find(m => m.title === key);
      if (!municipality) {
        console.error(`Municipality ID not found for key: ${key}`);
        continue;
      }

      const municipalityId = municipality.id;

      // Step 4: Iterate over locations
      for (const location of mainObject[key]) {
        // Step 5: Post location data
        await postData('https://api.foerderscouting-plattform.de/api/locations', {
          data: {
            title: location,
            municipality: municipalityId
          }
        });
      }
    } catch (error) {
      console.error(error.message);
    }
  }
}

// Start processing
processMainObject(mainObject);

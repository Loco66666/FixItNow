/**
 * Idempotent seed script for local development.
 *
 *   npm run seed                       # add missing data
 *   npm run seed -- --reset            # wipe FixItNow collections first
 *
 * Inserts a small but realistic dataset: 8 categories, 1 admin user,
 * 2 customer users, ~12 businesses across categories with locations, and a
 * handful of reviews so ratingAvg is non-zero in the UI.
 */
import mongoose, { Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { connectMongo, disconnectMongo } from "../config/db";
import { User } from "../models/User";
import { Category, slugify } from "../models/Category";
import { Business } from "../models/Business";
import { Review } from "../models/Review";
import {
  Intervention,
  InterventionStatusHistory,
  InterventionType,
  Vehicle,
} from "../models/automotive";
import { InterventionStatus } from "@fixitnow/types";

interface InterventionTypeSeed {
  name: string;
  slug: string;
  description: string;
}

/**
 * Normalized intervention catalog (PHASE 02 model). Customers may still
 * describe their problem in free text; this catalog structures the request
 * once the matching engine (PHASE 04) needs it.
 */
const INTERVENTION_TYPES: InterventionTypeSeed[] = [
  {
    name: "Diagnostic",
    slug: "diagnostic",
    description: "Lecture des codes défauts et diagnostic électronique.",
  },
  {
    name: "Batterie",
    slug: "batterie",
    description: "Test, recharge et remplacement de batterie.",
  },
  {
    name: "Démarrage",
    slug: "demarrage",
    description: "Pannes de démarrage, démarreur, alternateur.",
  },
  {
    name: "Freins",
    slug: "freins",
    description: "Plaquettes, disques, étriers, liquide de frein.",
  },
  {
    name: "Pneus",
    slug: "pneus",
    description: "Montage, équilibrage, permutation, crevaisons.",
  },
  {
    name: "Vidange",
    slug: "vidange",
    description: "Vidange moteur et remplacement des filtres.",
  },
  {
    name: "Révision",
    slug: "revision",
    description: "Révision constructeur périodique.",
  },
  {
    name: "Embrayage",
    slug: "embrayage",
    description: "Remplacement d'embrayage et volant moteur.",
  },
  {
    name: "Distribution",
    slug: "distribution",
    description: "Courroie ou chaîne de distribution.",
  },
  {
    name: "Climatisation",
    slug: "climatisation",
    description: "Recharge, entretien et réparation de clim.",
  },
  {
    name: "Électricité",
    slug: "electricite",
    description: "Recherche de pannes électriques et éclairage.",
  },
  {
    name: "Panne électronique",
    slug: "panne-electronique",
    description: "Capteurs, calculateurs, boîtiers.",
  },
  {
    name: "Carrosserie",
    slug: "carrosserie",
    description: "Petites réparations et remise en état.",
  },
  {
    name: "Remorquage",
    slug: "remorquage",
    description: "Dépannage et remorquage du véhicule.",
  },
];

interface CategorySeed {
  name: string;
  iconUrl: string;
}

interface BusinessSeed {
  name: string;
  category: string;
  about: string;
  address: string;
  contactPerson: string;
  email: string;
  phone: string;
  longitude: number;
  latitude: number;
  images: { url: string; alt?: string }[];
}

const CATEGORIES: CategorySeed[] = [
  {
    name: "Cleaning",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/995/995053.png",
  },
  {
    name: "Plumbing",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/1995/1995574.png",
  },
  {
    name: "Electrical",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/2933/2933245.png",
  },
  {
    name: "Painting",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/2913/2913072.png",
  },
  {
    name: "Repair",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/2972/2972186.png",
  },
  {
    name: "Pest Control",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/2693/2693699.png",
  },
  {
    name: "Carpentry",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/2933/2933197.png",
  },
  {
    name: "Shifting",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/2784/2784065.png",
  },
];

const BUSINESSES: BusinessSeed[] = [
  {
    name: "Sparkle Home Cleaners",
    category: "Cleaning",
    about:
      "Deep cleaning, kitchen and bathroom sanitisation, and weekly upkeep packages with eco-friendly products and trained staff.",
    address: "12 MG Road, Bengaluru, KA 560001",
    contactPerson: "Anita Sharma",
    email: "hello@sparkleclean.example",
    phone: "+91 98765 11122",
    longitude: 77.5946,
    latitude: 12.9716,
    images: [
      {
        url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952",
      },
    ],
  },
  {
    name: "Pipe Pros Plumbing",
    category: "Plumbing",
    about:
      "Leak repair, tap installation, water heater servicing, and 24x7 emergency response across the city.",
    address: "45 Brigade Road, Bengaluru, KA 560025",
    contactPerson: "Ravi Kumar",
    email: "support@pipepros.example",
    phone: "+91 98765 22233",
    longitude: 77.6092,
    latitude: 12.9719,
    images: [
      {
        url: "https://images.unsplash.com/photo-1581094488379-6c2e2b6c6f1b",
      },
    ],
  },
  {
    name: "Volt Masters Electricals",
    category: "Electrical",
    about:
      "Fan and light fittings, MCB repairs, full-home wiring audits, and inverter installation.",
    address: "78 Indiranagar 1st Stage, Bengaluru, KA 560038",
    contactPerson: "Karthik Iyer",
    email: "team@voltmasters.example",
    phone: "+91 98765 33344",
    longitude: 77.6408,
    latitude: 12.9784,
    images: [
      {
        url: "https://images.unsplash.com/photo-1581094288338-2314dddb7ece",
      },
    ],
  },
  {
    name: "Brushwork Painting Co.",
    category: "Painting",
    about:
      "Interior and exterior painting, waterproof coatings, and texture finishes with 7-day completion guarantees.",
    address: "9 Koramangala 5th Block, Bengaluru, KA 560095",
    contactPerson: "Meera Pillai",
    email: "studio@brushwork.example",
    phone: "+91 98765 44455",
    longitude: 77.6309,
    latitude: 12.9352,
    images: [
      {
        url: "https://images.unsplash.com/photo-1562259949-e8e7689d7828",
      },
    ],
  },
  {
    name: "FixIt Appliance Repair",
    category: "Repair",
    about:
      "Washing machine, refrigerator, microwave, and chimney repairs across major brands. 90-day workmanship warranty.",
    address: "23 HSR Layout Sector 2, Bengaluru, KA 560102",
    contactPerson: "Naveen Reddy",
    email: "service@fixit-repair.example",
    phone: "+91 98765 55566",
    longitude: 77.6492,
    latitude: 12.9116,
    images: [
      {
        url: "https://images.unsplash.com/photo-1581578017093-cd30fce4eeb7",
      },
    ],
  },
  {
    name: "Zero Pest Solutions",
    category: "Pest Control",
    about:
      "Cockroach gel treatment, termite control, and bed-bug heat treatment with child-safe chemicals.",
    address: "60 Whitefield Main Road, Bengaluru, KA 560066",
    contactPerson: "Pooja Menon",
    email: "info@zeropest.example",
    phone: "+91 98765 66677",
    longitude: 77.7499,
    latitude: 12.9698,
    images: [
      {
        url: "https://images.unsplash.com/photo-1599580546666-c8aab2c0b6d9",
      },
    ],
  },
  {
    name: "Woodworks Carpentry",
    category: "Carpentry",
    about:
      "Modular wardrobe install, door repairs, and custom shelf design with on-site measurement visits.",
    address: "11 Jayanagar 4th Block, Bengaluru, KA 560011",
    contactPerson: "Suresh Babu",
    email: "hello@woodworks.example",
    phone: "+91 98765 77788",
    longitude: 77.5836,
    latitude: 12.9237,
    images: [
      {
        url: "https://images.unsplash.com/photo-1504148455328-c376907d081c",
      },
    ],
  },
  {
    name: "MoveSafe Packers",
    category: "Shifting",
    about:
      "Local and intercity packers with bubble wrap, foam padding, and GPS-tracked trucks for valuables.",
    address: "5 Marathahalli Junction, Bengaluru, KA 560037",
    contactPerson: "Aisha Khan",
    email: "ops@movesafe.example",
    phone: "+91 98765 88899",
    longitude: 77.6975,
    latitude: 12.9569,
    images: [
      {
        url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c",
      },
    ],
  },
  {
    name: "ShineRight Sofa & Carpet",
    category: "Cleaning",
    about:
      "Specialised sofa shampooing, carpet steam cleaning, and stain removal with same-day service.",
    address: "33 BTM 2nd Stage, Bengaluru, KA 560076",
    contactPerson: "Deepa Rao",
    email: "book@shineright.example",
    phone: "+91 98765 99900",
    longitude: 77.6109,
    latitude: 12.9166,
    images: [
      {
        url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952",
      },
    ],
  },
  {
    name: "QuickFlow Plumbing",
    category: "Plumbing",
    about:
      "Drain unclogging, geyser servicing, RO maintenance, and pipe replacement with transparent pricing.",
    address: "201 Electronic City Phase 1, Bengaluru, KA 560100",
    contactPerson: "Imran Ali",
    email: "calls@quickflow.example",
    phone: "+91 98765 12121",
    longitude: 77.6648,
    latitude: 12.8438,
    images: [
      {
        url: "https://images.unsplash.com/photo-1581094488379-6c2e2b6c6f1b",
      },
    ],
  },
  {
    name: "Glow Painters",
    category: "Painting",
    about:
      "Asian Paints & Berger certified contractors, with 1-day touch-up service for rentals and resale prep.",
    address: "14 Banashankari 2nd Stage, Bengaluru, KA 560070",
    contactPerson: "Lakshmi Devi",
    email: "team@glowpainters.example",
    phone: "+91 98765 13131",
    longitude: 77.5499,
    latitude: 12.9344,
    images: [
      {
        url: "https://images.unsplash.com/photo-1562259949-e8e7689d7828",
      },
    ],
  },
  {
    name: "AmpCircuit Electricals",
    category: "Electrical",
    about:
      "AC installation, fan repair, smart-home wiring, and earthing/grounding audits for new flats.",
    address: "88 Bellandur, Bengaluru, KA 560103",
    contactPerson: "Vikram Singh",
    email: "ops@ampcircuit.example",
    phone: "+91 98765 14141",
    longitude: 77.6749,
    latitude: 12.9258,
    images: [
      {
        url: "https://images.unsplash.com/photo-1581094288338-2314dddb7ece",
      },
    ],
  },
];

async function seed({ reset }: { reset: boolean }): Promise<void> {
  await connectMongo();

  if (reset) {
    logger.info("Resetting collections…");
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Business.deleteMany({}),
      Review.deleteMany({}),
      InterventionType.deleteMany({}),
      Vehicle.deleteMany({}),
      Intervention.deleteMany({}),
      InterventionStatusHistory.deleteMany({}),
    ]);
  }

  // --- Users ---
  const adminEmail = "admin@fixitnow.dev";
  const customerEmail = "demo@fixitnow.dev";
  const ownerEmail = "owner@fixitnow.dev";

  const [admin, demoUser, owner] = await Promise.all([
    User.findOneAndUpdate(
      { email: adminEmail },
      {
        $setOnInsert: {
          name: "FixItNow Admin",
          email: adminEmail,
          password: "Admin#12345",
          role: "admin",
        },
      },
      { new: true, upsert: true, runValidators: true }
    ),
    User.findOneAndUpdate(
      { email: customerEmail },
      {
        $setOnInsert: {
          name: "Demo Customer",
          email: customerEmail,
          password: "Demo#12345",
          role: "user",
        },
      },
      { new: true, upsert: true, runValidators: true }
    ),
    User.findOneAndUpdate(
      { email: ownerEmail },
      {
        $setOnInsert: {
          name: "Demo Owner",
          email: ownerEmail,
          password: "Owner#12345",
          role: "owner",
        },
      },
      { new: true, upsert: true, runValidators: true }
    ),
  ]);

  logger.info(
    {
      admin: admin?.email,
      customer: demoUser?.email,
      owner: owner?.email,
    },
    "Seeded users (passwords match the seed file; rotate before prod)"
  );

  // --- Categories ---
  // findOneAndUpdate with $setOnInsert bypasses Mongoose's pre('validate')
  // hooks, so we have to compute the slug ourselves on insert. Otherwise
  // the unique index on `slug` chokes on multiple nulls.
  const categoriesByName = new Map<string, Types.ObjectId>();
  for (const c of CATEGORIES) {
    const doc = await Category.findOneAndUpdate(
      { name: c.name },
      {
        $setOnInsert: {
          name: c.name,
          slug: slugify(c.name),
          iconUrl: c.iconUrl,
        },
      },
      { new: true, upsert: true, runValidators: true }
    );
    categoriesByName.set(c.name, doc!._id as Types.ObjectId);
  }
  logger.info({ count: categoriesByName.size }, "Seeded categories");

  // --- Businesses ---
  const businessIdByName = new Map<string, Types.ObjectId>();
  for (const b of BUSINESSES) {
    const catId = categoriesByName.get(b.category);
    if (!catId) {
      logger.warn(
        { business: b.name, category: b.category },
        "skip — missing category"
      );
      continue;
    }
    const slugSuffix = new Types.ObjectId().toHexString().slice(-6);
    const doc = await Business.findOneAndUpdate(
      { name: b.name },
      {
        $setOnInsert: {
          name: b.name,
          slug: `${slugify(b.name)}-${slugSuffix}`,
          about: b.about,
          address: b.address,
          contactPerson: b.contactPerson,
          email: b.email,
          phone: b.phone,
          images: b.images,
          category: catId,
          owner: owner!._id,
          location: {
            type: "Point",
            coordinates: [b.longitude, b.latitude],
          },
        },
      },
      { new: true, upsert: true, runValidators: true }
    );
    businessIdByName.set(b.name, doc!._id as Types.ObjectId);
  }
  logger.info({ count: businessIdByName.size }, "Seeded businesses");

  // --- Reviews ---
  // One review per (user, business) — keep this idempotent by relying on the
  // unique compound index. Each iteration is a no-op when the row exists.
  const reviewPlan = [
    {
      business: "Sparkle Home Cleaners",
      rating: 5,
      comment: "Great team, spotless finish.",
    },
    {
      business: "Pipe Pros Plumbing",
      rating: 4,
      comment: "Quick response, fair price.",
    },
    {
      business: "Volt Masters Electricals",
      rating: 5,
      comment: "Sorted my wiring in 2h.",
    },
    { business: "Brushwork Painting Co.", rating: 4 },
    {
      business: "FixIt Appliance Repair",
      rating: 5,
      comment: "Fridge running like new.",
    },
  ];

  for (const r of reviewPlan) {
    const businessId = businessIdByName.get(r.business);
    if (!businessId) continue;
    await Review.updateOne(
      { business: businessId, user: demoUser!._id },
      {
        $setOnInsert: {
          business: businessId,
          user: demoUser!._id,
          rating: r.rating,
          comment: r.comment,
        },
      },
      { upsert: true }
    );
  }

  // --- Automotive: intervention type catalog ---
  // Idempotent upsert by slug; the unique index on `slug` guarantees no
  // duplicates even across concurrent runs.
  let typeCount = 0;
  for (const t of INTERVENTION_TYPES) {
    const res = await InterventionType.updateOne(
      { slug: t.slug },
      {
        $setOnInsert: {
          name: t.name,
          slug: t.slug,
          description: t.description,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0) typeCount += 1;
  }
  logger.info(
    { inserted: typeCount, total: INTERVENTION_TYPES.length },
    "Seeded intervention types"
  );

  // --- Automotive: demo customer vehicles ---
  if (demoUser) {
    const demoVehicles = [
      {
        owner: demoUser._id,
        registrationNumber: "AB-123-CD",
        make: "Renault",
        model: "Clio IV",
        version: "1.5 dCi 90 Energy",
        year: 2019,
        fuelType: "Diesel",
        transmission: "Manuelle",
        mileageKm: 87400,
        vehicleType: "Citadine",
      },
      {
        owner: demoUser._id,
        registrationNumber: "EF-456-GH",
        make: "Peugeot",
        model: "3008",
        version: "1.2 PureTech 130 Allure",
        year: 2021,
        fuelType: "Essence",
        transmission: "Automatique",
        mileageKm: 42100,
        vehicleType: "SUV",
      },
    ];

    let vehicleCount = 0;
    for (const v of demoVehicles) {
      const res = await Vehicle.updateOne(
        { registrationNumber: v.registrationNumber },
        { $setOnInsert: v },
        { upsert: true }
      );
      if (res.upsertedCount > 0) vehicleCount += 1;
    }
    logger.info(
      { inserted: vehicleCount, total: demoVehicles.length },
      "Seeded demo vehicles"
    );

    // --- Automotive: one REQUESTED intervention so dashboards are alive ---
    const clio = await Vehicle.findOne({
      registrationNumber: "AB-123-CD",
    });
    if (clio) {
      const existingIntervention = await Intervention.exists({
        vehicle: clio._id,
        status: InterventionStatus.REQUESTED,
      });
      if (!existingIntervention) {
        const intervention = await Intervention.create({
          customer: demoUser._id,
          vehicle: clio._id,
          status: InterventionStatus.REQUESTED,
          urgency: "URGENT",
          locationContext: "PARKING",
          title: "La voiture ne démarre plus",
          description:
            "Batterie à plat, je suis dans un parking sous-terrain à Limoges.",
          location: {
            address: "Place de la République",
            city: "Limoges",
            postalCode: "87000",
            coordinates: [1.2611, 45.8336],
          },
          services: ["Batterie", "Démarrage"],
          currency: "EUR",
          requestedAt: new Date(),
        });
        await InterventionStatusHistory.create({
          intervention: intervention._id,
          toStatus: InterventionStatus.REQUESTED,
          reason: "Intervention created (seed)",
        });
        logger.info("Seeded demo intervention");
      }
    }
  }

  // --- Recompute denormalised ratings on each business ---
  for (const businessId of businessIdByName.values()) {
    const [agg] = await Review.aggregate<{
      _id: null;
      avg: number;
      count: number;
    }>([
      { $match: { business: businessId } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    const ratingAvg = agg ? Math.round(agg.avg * 10) / 10 : 0;
    const ratingCount = agg?.count ?? 0;
    await Business.updateOne(
      { _id: businessId },
      { $set: { ratingAvg, ratingCount } }
    );
  }

  logger.info(
    { reviews: reviewPlan.length },
    "Seeded reviews and recomputed business ratings"
  );
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");
  logger.info({ mongo: env.MONGO_URI, reset }, "Starting seed…");
  try {
    await seed({ reset });
    logger.info("Seed complete");
  } catch (err) {
    logger.error({ err }, "Seed failed");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    await disconnectMongo();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

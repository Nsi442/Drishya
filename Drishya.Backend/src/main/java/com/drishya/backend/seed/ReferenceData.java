package com.drishya.backend.seed;

import java.util.List;

/**
 * The fixed vocabulary the seeded dataset draws on.
 *
 * <p>Fulfilment centres are deliberately generic place names. No real
 * marketplace is named here or anywhere else in this codebase.
 */
public final class ReferenceData {

    private ReferenceData() {
    }

    public record Site(String id, String name, String city, double lat, double lng, int docks) {}

    public record City(String name, double lat, double lng) {}

    public static final List<Site> FULFILMENT_CENTRES = List.of(
            new Site("fc-bhiwandi", "FC Bhiwandi", "Bhiwandi", 19.297, 73.0631, 8),
            new Site("fc-manesar", "FC Manesar", "Manesar", 28.3536, 76.9349, 10),
            new Site("fc-whitefield", "FC Whitefield", "Bengaluru", 12.9698, 77.75, 6),
            new Site("fc-sanand", "FC Sanand", "Ahmedabad", 22.9917, 72.3833, 7));

    public static final List<City> VENDOR_CITIES = List.of(
            new City("Pune", 18.5204, 73.8567),
            new City("Tirupur", 11.1085, 77.3411),
            new City("Mysuru", 12.2958, 76.6394),
            new City("Hyderabad", 17.385, 78.4867),
            new City("Ludhiana", 30.901, 75.8573),
            new City("Coimbatore", 11.0168, 76.9558),
            new City("Nashik", 19.9975, 73.7898),
            new City("Indore", 22.7196, 75.8577),
            new City("Surat", 21.1702, 72.8311),
            new City("Jaipur", 26.9124, 75.7873),
            new City("Nagpur", 21.1458, 79.0882),
            new City("Vadodara", 22.3072, 73.1812));

    public static final List<String> VENDOR_NAMES = List.of(
            "Anand Auto Components",
            "Nimbus Textiles",
            "Kaveri Foods",
            "Reddy Textronics",
            "Vasavi Packaging",
            "Om Sri Logistics Supplies",
            "Shree Ganesh Agro",
            "Bluewave Plastics",
            "Sundar Leather Works",
            "Prime Home Essentials",
            "Deccan Electricals",
            "Coastal Spices Co.");

    public static final List<String> CARRIERS = List.of(
            "Speedway Logistics",
            "Nandan Freight",
            "Kargo Movers",
            "Highway Express",
            "Trident Carriers");

    public static final List<String> VEHICLE_TYPES = List.of(
            "Tata Ace",
            "407 Mini Truck",
            "Eicher 14ft",
            "Ashok Leyland 19ft",
            "Bharat Benz 32ft");

    public static final int[] CAPACITIES_KG = {850, 1500, 4000, 7000, 16000};

    public static final List<String> DRIVER_NAMES = List.of(
            "Ramesh Kumar", "Suresh Patil", "Farhan Sheikh", "Vijay Singh", "Anil Yadav",
            "Manoj Tiwari", "Rakesh Sharma", "Deepak Rao", "Ashok Meena", "Sanjay Gupta",
            "Vikram Nair", "Prakash Reddy", "Naveen Joshi", "Ravi Verma", "Kishore Pillai",
            "Mahesh Chauhan", "Arjun Das", "Sunil Bhosale", "Dinesh Iyer", "Gopal Mishra");

    public static final List<String> COMMODITIES = List.of(
            "Cotton apparel — mixed cartons",
            "Consumer electronics accessories",
            "Packaged food — dry goods",
            "Home furnishings",
            "Footwear",
            "Personal care products",
            "Small kitchen appliances",
            "Stationery & office supplies",
            "Auto spare parts",
            "Toys & games");

    public static final List<String> DELAY_REASONS = List.of(
            "Traffic congestion on NH-48",
            "Extended loading at origin",
            "Driver rest break",
            "Toll plaza queue",
            "Weather — heavy rain",
            "Route diversion",
            "Vehicle breakdown",
            "Waiting for dock assignment");

    public static final List<String> RECEIVER_NAMES = List.of(
            "A. Krishnan", "M. Bhosale", "S. Fernandes", "R. Gill", "T. Menon");

    public static final List<String> EXCEPTION_OWNERS = List.of(
            "Priya Raghavan", "Imran Qureshi", "Lakshmi Nair", "Devendra Patil", "Unassigned");

    public static final String[] STATE_CODES = {"MH", "KA", "TN", "DL", "GJ", "RJ"};

    public static final String[] SERIES_CODES = {"AB", "CD", "EF", "GH"};
}

/** A small, deliberately messy customer list: decimal commas, a duplicate,
 * padded names, gaps, a value that is not a number and a formula cell. */
export const SAMPLE_NAME = 'customers-sample.csv'
export const SAMPLE = "id;name;city;amount;joined\n1;\"Smith, Anna\";Berlin;12,50;01.03.2024\n2; Bob ;Paris;7,25;2024-03-02\n2; Bob ;Paris;7,25;2024-03-02\n3;Chen;;1.234,00;02/03/2024\n4;\"=HYPERLINK(\"\"http://evil.test\"\")\";Rome;oops;2024-03-04\n5;Dana;Oslo;-3,00;\n7;Erik;Berlin;4,75;05.03.2024\n8;\"Fatima \";Paris;18,00;2024-03-06\n9;Gita;Rome;2,5;\n10;Hugo;Oslo;9,90;2024-03-08\n"

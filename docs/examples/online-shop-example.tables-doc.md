---
source: online-shop-example.yaml
source_sha256: <sha256>
generated_at: <generated-at>
---

# online-shop

## customers

Customer profiles need to be looked up when handling orders and support requests.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| id | integer | no |  |  |  |
| public\_id | char(26) | no |  | ulid | customer number, customer code |
| name | varchar(100) | no |  |  | customer full name |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_customers | id |

### Unique Constraints

| Constraint Name | Columns |
| --- | --- |
| ux\_customers\_public\_id | public\_id |

## orders

Customers need to view their order history and cancel orders that haven't shipped yet.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| id | integer | no |  |  |  |
| public\_id | char(26) | no |  | ulid | order number |
| customer\_id | integer | no |  |  | buyer customer |
| status | varchar(20) | no |  |  | order state, fulfillment status |
| created\_at | timestamp | no |  |  |  |
| updated\_at | timestamp | no |  |  |  |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_orders | id |

### Unique Constraints

| Constraint Name | Columns |
| --- | --- |
| ux\_orders\_public\_id | public\_id |

### Foreign Keys

| Constraint Name | Columns | Referenced Table | Referenced Columns | On Delete | On Update |
| --- | --- | --- | --- | --- | --- |
| fk\_orders\_customer | customer\_id | customers | id | restrict | restrict |

### Check Constraints

| Constraint Name | Column | Values |
| --- | --- | --- |
| ck\_orders\_status | status | created, cancelled |

### Indexes

| Index Name | Indexed Columns | Description |
| --- | --- | --- |
| ix\_orders\_status | status | Used to search orders by status. |
| ix\_orders\_customer\_created\_at | customer\_id, created\_at | Used to list orders for a customer. |

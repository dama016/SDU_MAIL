CREATE DATABASE IF NOT EXISTS SDU_EMAIL_Dataset
    DEFAULT CHARACTER SET = 'utf8mb4';


USE sdu_email_dataset; 
CREATE TABLE IF NOT EXISTS students(
    id INT PRIMARY KEY,
    sdu_id VARCHAR(20) NOT NULL,
    first_name VARCHAR(25) NOT NULL,
    last_name VARCHAR(25) NOT NULL,
    middle_name VARCHAR(25),
    sdu_email VARCHAR(100) NOT NULL,
    personal_email VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    faculty VARCHAR(100) NOT NULL,
    major VARCHAR(100) NOT NULL,
    year_of_study INT NOT NULL,
    group_name VARCHAR(20) NOT NULL,
    gpa DECIMAL(3,2) NOT NULL,
    advisor VARCHAR(100) NOT NULL,
    account_status VARCHAR(20)
);

INSERT INTO students(
    id, sdu_id, first_name, last_name, middle_name, 
    sdu_email, personal_email, phone_number, 
    faculty, major, year_of_study, group_name, gpa, 
    advisor, account_status
) VALUES 
(1, '250104089', 'Almat', 'Amanov', NULL, '250104089@sdu.edu.kz', 'almatik91@gmail.com', '+77011234567', 'Engineering and Natural Sciences', 'Computer Science', 1, '02-N', 3.91, 'Sultan Kimatov', 'active'),
(2, '240103090', 'Aidana', 'Akhmetova', NULL, '240103090@sdu.edu.kz', 'aidanaakhmetova@gmail.com', '+77021234599', 'Education and Human rights', 'Teacher', 2, '03-N', 3.85, 'Zhaigali Salamat', NULL),
(3, '230102091', 'Askar', 'Beknazarov', NULL, '230102091@sdu.edu.kz', 'askarbeknazarov@gmail.com', '+77031238191', 'Mathematics and Applied Mathematics', 'Mechanical Engineering', 3, '04-N', 3.75, 'Aida Qalaman', 'active'),
(4, '220101092', 'Aruzhan', 'Kassymova', 'Dauletkyzy', '220101092@sdu.edu.kz', 'aruzhankassymova@gmail.com', '+77041238192', 'Engineering and Natural Sciences', 'Information Systems', 4, '05-N', 3.80, 'Sultan Kimatov', NULL),
(5, '220100093', 'Aibek', 'Sarsenov', NULL, '220100093@sdu.edu.kz', 'aibeksarsenov@gmail.com', '+77756262955', 'Engineering and Natural Sciences', 'Mechanical Engineering', 4, '01-N', 3.70, 'Aidar Sadykov', 'active'),
(6, '250099094', 'Akbota', 'Omirzakova', NULL, '250099094@sdu.edu.kz', 'akbotaomirzakova@gmail.com', '+77061238194', 'Education and Human rights', 'Lawyer', 1, '02-N', 3.65, 'Zhenis Zhalgas', NULL),
(7, '240098095', 'Ayan', 'Kassymov', NULL, '240098095@sdu.edu.kz', 'ayankassymov@gmail.com', '+77071238195', 'Engineering and Natural Sciences', 'Information Systems', 2, '06-N', 3.80, 'Sultan Kimatov', 'active'),
(8, '230097096', 'Aizhan', 'Suleimenova', NULL, '230097096@sdu.edu.kz', 'aizhansuleimenova@gmail.com', NULL, 'Education and Human rights', 'Teacher', 3, '09-N', 3.75, 'Zhaigali Salamat', NULL),
(9, '220096097', 'Lura', 'Suleimenova', NULL, '220096097@sdu.edu.kz', 'lurasuleimenova@gmail.com', '+77091238197', 'Engineering and Natural Sciences', 'Mechanical Engineering', 4, '10-N', 3.70, 'Aidar Sadykov', 'active'),
(10, '230095098', 'Raushan', 'K', 'Dauletkyzy', '230095098@sdu.edu.kz', 'raushan.k@gmail.com', '+77028876599', 'Mathematics and Applied Mathematics', 'Mathematics in Computer Science', 3, '01-N', 3.80, 'Bolat Asanali', NULL),--
(11, '220094099', 'Didar', 'Esirkepov', NULL, '220094099@sdu.edu.kz', 'didaresirkepov@gmail.com', '+77091238199', 'Engineering and Natural Sciences', 'Mechanical Engineering', 4, '12-N', 3.70, 'Aidar Sadykov', 'active'),
(12, '240093102', 'Bakyt', 'Suleimenova', NULL, '240093102@sdu.edu.kz', 'bakytulesimenova@gmail.com', NULL, 'Engineering and Natural Sciences', 'Information Systems', 2, '03-N', 3.75, 'Sultan Kimatov', NULL),
(13, '230092101', 'Rakhat', 'Nazarov', 'Nazarovich', '230092101@sdu.edu.kz', 'rakhatnazarov@gmail.com', '+77011238199', 'Mathematics and Applied Mathematics', 'Mathematics in Computer Science', 3, '14-N', 3.80, 'Bolat Asanali', NULL),
(14, '250091100', 'Aigul', 'Tleukhanova', NULL, '250091100@sdu.edu.kz', 'aigultleukhanova@gmail.com', '+77019987644', 'Education and Human rights', 'Teacher', 1, '03-N', 3.65, 'Zhaigali Salamat', NULL),
(15, '230190099', 'Dina', 'Sarsenova', NULL, '230190099@sdu.edu.kz', 'dinasarsenova@gmail.com', NULL, 'Education and Human rights', 'Teacher', 3, '01-N', 3.75, 'Zhaigali Salamat', NULL),
(16, '220089101', 'Aigerim', 'Zhanarova', NULL, '220089101@sdu.edu.kz', 'aigerim1zhanarova@gmail.com', '+77014486522', 'Engineering and Natural Sciences', 'Information Systems', 4, '01-N', 3.65, 'Sultan Kimatov', NULL),--
(17, '240088102', 'Aisulu', 'Tleukhanova', NULL, '240088102@sdu.edu.kz', 'aisulutleukhanova@gmail.com', '+77019987644', 'Education and Human rights', 'Teacher', 2, '02-N', 3.65, 'Zhaigali Salamat', NULL),
(18, '230087103', 'Zhan', 'Dosymov', NULL, '230087103@sdu.edu.kz', 'zhandosymov@gmail.com', NULL, 'Engineering and Natural Sciences', 'Mechanical Engineering', 3, '14-N', 3.80, 'Bolat Asanali', NULL),--
(19, '250086104', 'Bolat', 'Sarsenbay', 'Sakenuly', '250086104@sdu.edu.kz', 'bolatsarsenbay@gmail.com', '+77019987644', 'Education and Human rights', 'Lawyer', 1, '04-N', 3.65, 'Zhenis Zhalgas', NULL),
(20, '220085105', 'Sabina', 'Sadykova', NULL, '220085105@sdu.edu.kz', 'sabinasadykova@gmail.com', NULL, 'Education and Human rights', 'Teacher', 4, '05-N', 3.65, 'Zhenis Zhalgas', NULL);